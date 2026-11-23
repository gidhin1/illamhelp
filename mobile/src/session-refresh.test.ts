import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSessionResponse } from "./api";
import { createSessionRefresh } from "./session-refresh";

const initialSession: AuthSessionResponse = {
  userId: "member",
  publicUserId: "public-member",
  analyticsUserId: null,
  username: "member",
  userType: "both",
  roles: ["both"],
  accessToken: "first-access-token",
  refreshToken: "first-refresh-token",
  tokenType: "Bearer",
  expiresIn: 60
};
const rotated = {
  ...initialSession,
  accessToken: "next-access-token",
  refreshToken: "next-refresh-token"
};

function setup(session = initialSession) {
  const request = vi.fn<(token: string) => Promise<AuthSessionResponse>>().mockResolvedValue(rotated);
  const onRefresh = vi.fn();
  const onExpire = vi.fn();
  const rejected = new Error("Rejected refresh token");
  const controller = createSessionRefresh(session, Date.now(), request, (error) => error === rejected, onRefresh, onExpire);
  return { controller, request, onRefresh, onExpire, rejected };
}

describe("native session refresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes ahead of expiry and delivers the rotated credentials", async () => {
    const first = setup();
    first.controller.setActive(true);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(first.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first.request).toHaveBeenCalledExactlyOnceWith(initialSession.refreshToken);
    expect(first.onRefresh).toHaveBeenCalledExactlyOnceWith(rotated);

    const next = setup(rotated);
    next.controller.setActive(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(next.request).toHaveBeenCalledExactlyOnceWith(rotated.refreshToken);
  });

  it("recovers on foreground after expiry and shares an in-flight refresh", async () => {
    const { controller, request, onRefresh } = setup();
    let resolveRefresh!: (response: AuthSessionResponse) => void;
    request.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));
    controller.setActive(true);
    controller.setActive(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(request).not.toHaveBeenCalled();
    controller.setActive(true);
    controller.setActive(false);
    controller.setActive(true);
    expect(request).toHaveBeenCalledTimes(1);
    resolveRefresh(rotated);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(rotated);
  });

  it("retries a transient failure and expires on a rejected refresh", async () => {
    const { controller, request, rejected, onRefresh, onExpire } = setup();
    request.mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(rejected);
    controller.setActive(true);
    await vi.advanceTimersByTimeAsync(34_999);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("expires at the access-token deadline when no refresh token was issued", async () => {
    const { controller, request, onExpire } = setup({ ...initialSession, refreshToken: undefined });
    controller.setActive(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).not.toHaveBeenCalled();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("ignores a late refresh response after sign-out", async () => {
    const { controller, request, onRefresh, onExpire } = setup();
    let resolveRefresh!: (response: AuthSessionResponse) => void;
    request.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));
    controller.setActive(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request).toHaveBeenCalledTimes(1);
    controller.stop();
    resolveRefresh(rotated);
    await vi.advanceTimersByTimeAsync(0);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });
});
