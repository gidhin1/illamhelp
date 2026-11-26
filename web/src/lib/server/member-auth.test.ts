import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginLogin, finishLogin, memberAuthConfig } from "./member-auth";

const fixtures = vi.hoisted(() => ({
  store: new Map<string, string>(),
  identity: vi.fn(),
  decode: vi.fn()
}));

vi.mock("redis", () => ({
  createClient: () => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    set: async (key: string, value: string) => fixtures.store.set(key, value),
    getDel: async (key: string) => {
      const value = fixtures.store.get(key);
      fixtures.store.delete(key);
      return value;
    }
  })
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: fixtures.identity,
  decodeJwt: fixtures.decode
}));

const origin = "https://illamhelp.example";
const issuer = "https://id.illamhelp.example/realms/illamhelp";

beforeEach(() => {
  vi.stubEnv("WEB_AUTH_ORIGIN", origin);
  vi.stubEnv("WEB_AUTH_ISSUER", issuer);
  vi.stubEnv("WEB_AUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("WEB_AUTH_REDIS_URL", "redis://localhost");
  vi.stubEnv("WEB_AUTH_GOOGLE", "true");
  vi.stubEnv("WEB_AUTH_FACEBOOK", "false");
  vi.stubEnv("WEB_AUTH_PASSWORD_RESET", "true");
  fixtures.store.clear();
  fixtures.identity.mockReset();
  fixtures.decode.mockReturnValue({ sub: "member" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function config() {
  const result = memberAuthConfig();
  if (!result) throw new Error("Test sign-in configuration is missing.");
  return result;
}

async function googleFlow() {
  const response = await beginLogin(config(), "google");
  const location = new URL(response.headers.get("location")!);
  const state = location.searchParams.get("state");
  const cookie = response.cookies.get("illamhelp_member_flow");
  return {
    location,
    cookie,
    callback: (callbackState = state) => new NextRequest(
      `${origin}/auth/oidc/callback?code=fixture-code&state=${callbackState}`,
      { headers: { Cookie: `${cookie?.name}=${cookie?.value}` } }
    )
  };
}

function mockProvider(nonce: string | null) {
  fixtures.identity.mockResolvedValue({ payload: { sub: "member", nonce, azp: "illamhelp-member-web" } });
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({
      access_token: "access-secret", refresh_token: "refresh-secret", id_token: "id-token",
      expires_in: 300, refresh_expires_in: 1800
    }))
    .mockResolvedValueOnce(Response.json({ complete: false }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("hosted member sign-in", () => {
  it("binds Google and recovery to distinct Keycloak entry points", async () => {
    const { location, cookie } = await googleFlow();
    expect(location.pathname).toMatch(/\/auth$/);
    expect(location.searchParams.get("kc_idp_hint")).toBe("google");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect(cookie?.value).toBe(location.searchParams.get("state"));

    const reset = await beginLogin(config(), "reset");
    expect(new URL(reset.headers.get("location")!).pathname).toMatch(/\/forgot-credentials$/);
  });

  it("allows only the configured Facebook broker and keeps it off by default", async () => {
    const disabled = await beginLogin(config(), "facebook");
    expect(disabled.headers.get("location")).toBe(origin + "/auth/login");
    expect(fixtures.store.size).toBe(0);

    vi.stubEnv("WEB_AUTH_FACEBOOK", "true");
    const enabled = await beginLogin(config(), "facebook");
    const target = new URL(enabled.headers.get("location")!);
    expect(target.origin).toBe(new URL(issuer).origin);
    expect(target.searchParams.get("kc_idp_hint")).toBe("facebook");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(enabled.cookies.get("illamhelp_member_flow")).toMatchObject({ httpOnly: true, secure: true });
    expect((await beginLogin(config(), "unknown")).headers.get("location")).toBe(origin + "/auth/login");
  });

  it("rejects unrelated callbacks and consumes the valid state only once", async () => {
    const { location, callback } = await googleFlow();
    const fetch = mockProvider(location.searchParams.get("nonce"));
    const denied = await finishLogin(config(), callback("different-state"));
    expect(denied.headers.get("location")).toBe(origin + "/auth/login?signin=retry");
    expect(fetch).not.toHaveBeenCalled();

    const success = await finishLogin(config(), callback());
    expect(success.headers.get("location")).toBe(origin + "/auth/onboarding");
    expect(success.cookies.get("illamhelp_member_session")).toMatchObject({ httpOnly: true, secure: true });
    expect(success.headers.get("set-cookie")).not.toContain("refresh-secret");
    expect(fetch.mock.calls[0][1].body.get("code_verifier")).toHaveLength(43);

    const replay = await finishLogin(config(), callback());
    expect(replay.headers.get("location")).toBe(origin + "/auth/login?signin=retry");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses an ID token from another browser sign-in", async () => {
    const { callback } = await googleFlow();
    const fetch = mockProvider("unrelated-nonce");
    const denied = await finishLogin(config(), callback());
    expect(denied.headers.get("location")).toBe(origin + "/auth/login?signin=retry");
    expect(denied.cookies.get("illamhelp_member_session")).toBeUndefined();
    expect(String(fetch.mock.calls[1][0])).toMatch(/\/logout$/);
  });
});
