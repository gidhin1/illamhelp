import { describe, expect, it } from "vitest";

import { SlidingWindowRateLimiter } from "./sliding-window-rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests within limit and blocks once exhausted", () => {
    const limiter = new SlidingWindowRateLimiter();
    const key = "jobs-write:127.0.0.1";
    const now = 1_000_000;

    const first = limiter.consume(key, 60_000, 2, now);
    const second = limiter.consume(key, 60_000, 2, now + 1);
    const blocked = limiter.consume(key, 60_000, 2, now + 2);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it("resets counts after the configured window", () => {
    const limiter = new SlidingWindowRateLimiter();
    const key = "search-read:10.0.0.2";
    const now = 500_000;

    limiter.consume(key, 2_000, 1, now);
    const blocked = limiter.consume(key, 2_000, 1, now + 100);
    const afterWindow = limiter.consume(key, 2_000, 1, now + 2_100);

    expect(blocked.allowed).toBe(false);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(0);
  });

  it("evicts stale buckets before applying new limits", () => {
    const limiter = new SlidingWindowRateLimiter(2);
    limiter.consume("k1", 100, 1, 0);
    limiter.consume("k2", 100, 1, 1);

    // New request in a later time window forces stale cleanup.
    limiter.consume("k3", 100, 1, 200);

    const k3Blocked = limiter.consume("k3", 100, 1, 201);
    const k1AllowedAgain = limiter.consume("k1", 100, 1, 202);

    expect(k3Blocked.allowed).toBe(false);
    expect(k1AllowedAgain.allowed).toBe(true);
  });
});
