import { NextRequest, NextResponse } from "next/server";
import { beginLogin, finishLogin, memberAuthConfig } from "@/lib/server/member-auth";

export async function GET(request: NextRequest, context: RouteContext<"/auth/oidc/[action]">) {
  const config = memberAuthConfig();
  if (!config) return new NextResponse("Sign-in option unavailable", { status: 404 });
  const { action } = await context.params;
  try {
    return action === "callback" ? await finishLogin(config, request) : await beginLogin(config, action);
  } catch {
    const response = NextResponse.redirect(new URL("/auth/login?signin=retry", config.origin), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
