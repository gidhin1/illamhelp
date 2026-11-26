import { NextRequest, NextResponse } from "next/server";
import { apiFetch, endSession, memberAuthConfig, sessionAccessToken } from "@/lib/server/member-auth";

const restRoots = new Set(["jobs", "profiles", "connections", "consent", "notifications"]);
const mediaMethods = new Set([
  "CreateUploadTicket", "CompleteUpload", "ListMyMedia", "ListProfileMedia", "ListJobMedia",
  "ListVerificationDocuments", "RequestMediaReview"
]);
const noStore = { "Cache-Control": "no-store" };

async function proxy(request: NextRequest, context: RouteContext<"/api/member/[...path]">) {
  const config = memberAuthConfig();
  if (!config) return new NextResponse(null, { status: 404, headers: noStore });
  if (request.method !== "GET" && request.headers.get("origin") !== config.origin) {
    return new NextResponse(null, { status: 403, headers: noStore });
  }
  const { path } = await context.params;
  if (!path.every((segment) => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(segment))) {
    return new NextResponse(null, { status: 404, headers: noStore });
  }
  const route = path.join("/");
  try {
    if (route === "logout" && request.method === "POST") return await endSession(config, request);
    const media = request.method === "POST" && path.length === 2
      && path[0] === "media.v1.MediaService" && mediaMethods.has(path[1]);
    const auth = (route === "auth/me" && request.method === "GET") || route === "auth/member-onboarding";
    if (!media && !auth && !restRoots.has(path[0])) return new NextResponse(null, { status: 404, headers: noStore });
    const token = await sessionAccessToken(config, request);
    if (!token) return new NextResponse(null, { status: 401, headers: noStore });
    const headers = new Headers();
    for (const name of ["content-type", "accept", "x-grpc-web"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const init = { method: request.method, headers, body: request.body, duplex: "half" as const };
    let upstream: Response;
    if (media) {
      const base = (process.env.WEB_AUTH_MEDIA_URL || "http://localhost:9091").replace(/\/$/, "");
      headers.set("Authorization", `Bearer ${token}`);
      upstream = await fetch(`${base}/${route}`, {
        ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)
      });
    } else {
      upstream = await apiFetch(`/${route}${request.nextUrl.search}`, token, init);
    }
    const replyHeaders = new Headers(noStore);
    for (const name of ["content-type", "grpc-status", "grpc-message", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) replyHeaders.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: replyHeaders });
  } catch {
    return NextResponse.json({ message: "Sign-in service is unavailable. Try again." }, { status: 503, headers: noStore });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
