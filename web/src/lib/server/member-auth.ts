import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { WEB_SESSION_MARKER } from "../member-session";

const CLIENT_ID = "illamhelp-member-web";
const SESSION_COOKIE = "illamhelp_member_session";
const FLOW_COOKIE = "illamhelp_member_flow";
const FLOW_LIFETIME = 600;
const SESSION_LIFETIME = 8 * 60 * 60;
const identifierPattern = /^[a-zA-Z0-9_-]{43}$/;
const sessionKey = (id: string) => `illamhelp:web:session:${id}`;
const flowKey = (id: string) => `illamhelp:web:flow:${id}`;
const randomId = () => randomBytes(32).toString("base64url");

export function memberAuthConfig() {
  const { WEB_AUTH_ORIGIN, WEB_AUTH_ISSUER, WEB_AUTH_CLIENT_SECRET, WEB_AUTH_REDIS_URL } = process.env;
  if (!WEB_AUTH_ORIGIN || !WEB_AUTH_ISSUER || !WEB_AUTH_CLIENT_SECRET || !WEB_AUTH_REDIS_URL) return null;
  const origin = new URL(WEB_AUTH_ORIGIN);
  const issuer = new URL(WEB_AUTH_ISSUER);
  for (const url of [origin, issuer]) {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
      throw new Error("Member authentication requires HTTPS.");
    }
  }
  return {
    origin: origin.origin,
    issuer: issuer.href.replace(/\/$/, ""),
    internalIssuer: (process.env.WEB_AUTH_INTERNAL_ISSUER || issuer.href).replace(/\/$/, ""),
    secret: WEB_AUTH_CLIENT_SECRET,
    redisUrl: WEB_AUTH_REDIS_URL,
    google: process.env.WEB_AUTH_GOOGLE === "true",
    facebook: process.env.WEB_AUTH_FACEBOOK === "true",
    reset: process.env.WEB_AUTH_PASSWORD_RESET === "true",
    secure: origin.protocol === "https:"
  };
}
type Config = NonNullable<ReturnType<typeof memberAuthConfig>>;
interface LoginFlow { verifier: string; nonce: string }
interface Session {
  accessToken: string;
  refreshToken: string;
  accessExpires: number;
  expires: number;
}

function createSessionStore(url: string) {
  return createClient({
    url,
    socket: { connectTimeout: 3000, reconnectStrategy: false },
    disableOfflineQueue: true
  });
}

let redisConnection: Promise<ReturnType<typeof createSessionStore>> | undefined;
function redis(config: Config): Promise<ReturnType<typeof createSessionStore>> {
  if (!redisConnection) {
    const client = createSessionStore(config.redisUrl);
    client.on("error", () => { redisConnection = undefined; });
    redisConnection = client.connect().then(() => client).catch((error) => {
      redisConnection = undefined;
      throw error;
    });
  }
  return redisConnection;
}

function cookieOptions(config: Config, maxAge: number) {
  return { httpOnly: true, secure: config.secure, sameSite: "lax" as const, path: "/", maxAge };
}

function redirect(config: Config, path: string) {
  const response = NextResponse.redirect(new URL(path, config.origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function cookieId(request: NextRequest, name: string) {
  const value = request.cookies.get(name)?.value;
  return value && identifierPattern.test(value) ? value : null;
}

export async function beginLogin(config: Config, action: string) {
  const enabled = (action === "google" && config.google) || (action === "facebook" && config.facebook)
    || (action === "reset" && config.reset) || action === "password";
  if (!enabled) {
    return redirect(config, "/auth/login");
  }
  const id = randomId();
  const flow: LoginFlow = { verifier: randomId(), nonce: randomId() };
  const store = await redis(config);
  await store.set(flowKey(id), JSON.stringify(flow), { EX: FLOW_LIFETIME });
  const endpoint = action === "reset" ? "forgot-credentials" : "auth";
  const url = new URL(`${config.issuer}/protocol/openid-connect/${endpoint}`);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${config.origin}/auth/oidc/callback`,
    response_type: "code",
    scope: "openid email profile",
    state: id,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256"
  }).toString();
  if (action === "google" || action === "facebook") url.searchParams.set("kc_idp_hint", action);
  if (action === "password") {
    url.searchParams.set("kc_idp_hint", "");
    url.searchParams.set("prompt", "login");
  }
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(FLOW_COOKIE, id, cookieOptions(config, FLOW_LIFETIME));
  return response;
}

class TokenRequestError extends Error {
  constructor(readonly status: number) { super("Identity service request failed"); }
}

async function keycloak(config: Config, endpoint: string, data: Record<string, string>) {
  const response = await fetch(`${config.internalIssuer}/protocol/openid-connect/${endpoint}`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...data, client_id: CLIENT_ID, client_secret: config.secret })
  });
  if (!response.ok) throw new TokenRequestError(response.status);
  return response;
}

function parseSession(token: Record<string, unknown>, previousExpiry = Infinity): Session {
  const { access_token, refresh_token, expires_in, refresh_expires_in } = token;
  if (typeof access_token !== "string" || typeof refresh_token !== "string"
      || typeof expires_in !== "number" || expires_in <= 0) {
    throw new Error("Identity service returned an incomplete session.");
  }
  const now = Date.now();
  const lifetime = typeof refresh_expires_in === "number" && refresh_expires_in > 0
    ? Math.min(refresh_expires_in, SESSION_LIFETIME) : SESSION_LIFETIME;
  return { accessToken: access_token, refreshToken: refresh_token,
    accessExpires: now + expires_in * 1000, expires: Math.min(previousExpiry, now + lifetime * 1000) };
}

function ttl(session: Session) {
  return Math.max(1, Math.ceil((session.expires - Date.now()) / 1000));
}

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function verifyIdentity(config: Config, idToken: unknown, nonce: string) {
  if (typeof idToken !== "string") throw new Error("Identity token missing.");
  const uri = `${config.internalIssuer}/protocol/openid-connect/certs`;
  let keys = jwks.get(uri);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(uri));
    jwks.set(uri, keys);
  }
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: config.issuer, audience: CLIENT_ID, algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce"]
  });
  if (payload.nonce !== nonce || (payload.azp !== undefined && payload.azp !== CLIENT_ID)
      || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== CLIENT_ID)) {
    throw new Error("Identity token does not match the browser session.");
  }
  return payload.sub;
}

export async function finishLogin(config: Config, request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = cookieId(request, FLOW_COOKIE);
  const failure = redirect(config, "/auth/login?signin=retry");
  if (!id || id !== params.get("state")) return failure;
  failure.cookies.set(FLOW_COOKIE, "", cookieOptions(config, 0));
  const store = await redis(config);
  const flow = await store.getDel(flowKey(id));
  const code = params.get("code");
  if (!flow || !code || params.has("error") || (params.has("iss") && params.get("iss") !== config.issuer)) return failure;
  const { nonce, verifier } = JSON.parse(flow) as LoginFlow;
  let session: Session | undefined;
  try {
    const token = await (await keycloak(config, "token", {
      grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: `${config.origin}/auth/oidc/callback`
    })).json();
    session = parseSession(token);
    const subject = await verifyIdentity(config, token.id_token, nonce);
    if (decodeJwt(session.accessToken).sub !== subject) throw new Error("Session subject mismatch.");
    const status = await apiFetch("/auth/member-onboarding", session.accessToken);
    if (!status.ok) throw new Error("Member session denied.");
    const { complete } = await status.json();
    if (typeof complete !== "boolean") throw new Error("Invalid onboarding response.");
    const sessionId = randomId();
    const oldId = cookieId(request, SESSION_COOKIE);
    if (oldId) await store.del(sessionKey(oldId));
    await store.set(sessionKey(sessionId), JSON.stringify(session), { EX: ttl(session) });
    const response = redirect(config, complete ? "/jobs" : "/auth/onboarding");
    response.cookies.set(SESSION_COOKIE, sessionId, cookieOptions(config, ttl(session)));
    response.cookies.set(WEB_SESSION_MARKER, "1", { ...cookieOptions(config, ttl(session)), httpOnly: false });
    response.cookies.set(FLOW_COOKIE, "", cookieOptions(config, 0));
    response.cookies.set("illamhelp_access_token", "", { path: "/", maxAge: 0 });
    response.cookies.set("illamhelp_refresh_token", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    if (session) await revoke(config, session.refreshToken);
    return failure;
  }
}

async function revoke(config: Config, refreshToken: string) {
  await keycloak(config, "logout", { refresh_token: refreshToken }).catch(() => undefined);
}

async function removeSession(config: Config, id: string) {
  const value = await (await redis(config)).getDel(sessionKey(id));
  if (value) await revoke(config, (JSON.parse(value) as Session).refreshToken);
}

export async function endSession(config: Config, request: NextRequest) {
  const id = cookieId(request, SESSION_COOKIE);
  if (id) await removeSession(config, id);
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(config, 0));
  response.cookies.set(WEB_SESSION_MARKER, "", { ...cookieOptions(config, 0), httpOnly: false });
  return response;
}

const compareSet = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
`;

export async function sessionAccessToken(config: Config, request: NextRequest) {
  const id = cookieId(request, SESSION_COOKIE);
  if (!id) return null;
  const store = await redis(config);
  const key = sessionKey(id);
  const lock = `${key}:refresh`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = await store.get(key);
    if (!value) return null;
    const session = JSON.parse(value) as Session;
    if (session.expires <= Date.now()) return null;
    if (session.accessExpires > Date.now() + 1000) return session.accessToken;
    const owner = randomId();
    if (!await store.set(lock, owner, { NX: true, PX: 8000 })) {
      await delay(100);
      continue;
    }
    try {
      if (await store.get(key) !== value) continue;
      const token = await (await keycloak(config, "token", {
        grant_type: "refresh_token", refresh_token: session.refreshToken
      })).json();
      const updated = parseSession(token, session.expires);
      const saved = await store.eval(compareSet, { keys: [key], arguments: [value, JSON.stringify(updated), String(ttl(updated))] });
      if (saved) return updated.accessToken;
      await revoke(config, updated.refreshToken);
      return null;
    } catch (error) {
      if (!(error instanceof TokenRequestError) || error.status !== 400) throw error;
      await store.eval(compareSet, { keys: [key], arguments: [value, "", "0"] });
      return null;
    } finally {
      await store.eval(compareSet, { keys: [lock], arguments: [owner, "", "0"] });
    }
  }
  throw new Error("Member session refresh is busy.");
}

export function apiFetch(path: string, accessToken: string, init?: RequestInit) {
  const origin = (process.env.WEB_AUTH_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${origin}${path}`, {
    ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)
  });
}
