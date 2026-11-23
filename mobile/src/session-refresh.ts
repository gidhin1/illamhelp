import type { AuthSessionResponse } from "./api";

const retryDelayMs = 5_000;
const maximumRefreshLeadMs = 30_000;

export function createSessionRefresh(
  session: AuthSessionResponse,
  receivedAt: number,
  requestRefresh: (refreshToken: string) => Promise<AuthSessionResponse>,
  isRejected: (error: unknown) => boolean,
  onRefresh: (session: AuthSessionResponse) => void,
  onExpire: () => void
) {
  const lifetimeMs = session.expiresIn * 1_000;
  const expiresAt = receivedAt + lifetimeMs;
  const leadMs = session.refreshToken ? Math.min(lifetimeMs / 2, maximumRefreshLeadMs) : 0;
  let nextCheckAt = expiresAt - leadMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let stopped = false;
  let refreshing = false;

  function clearTimer(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function stop(): void {
    stopped = true;
    clearTimer();
  }

  function schedule(): void {
    clearTimer();
    if (stopped || !active || refreshing || !Number.isFinite(nextCheckAt)) return;
    timer = setTimeout(() => void check(), Math.min(2_147_483_647, Math.max(0, nextCheckAt - Date.now())));
  }

  async function check(): Promise<void> {
    if (stopped || !active || refreshing) return;
    if (Date.now() < nextCheckAt) {
      schedule();
      return;
    }
    if (!session.refreshToken) {
      stop();
      onExpire();
      return;
    }

    refreshing = true;
    try {
      const updated = await requestRefresh(session.refreshToken);
      if (!stopped) {
        stop();
        onRefresh(updated);
      }
    } catch (error) {
      if (stopped) return;
      if (isRejected(error)) {
        stop();
        onExpire();
      } else {
        nextCheckAt = Date.now() + retryDelayMs;
      }
    } finally {
      refreshing = false;
      schedule();
    }
  }

  return {
    setActive(value: boolean): void {
      active = value;
      if (active) void check();
      else clearTimer();
    },
    stop
  };
}
