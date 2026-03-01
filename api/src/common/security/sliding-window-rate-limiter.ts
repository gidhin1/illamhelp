export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAtEpochMs: number;
}

interface RateBucket {
  count: number;
  windowStartEpochMs: number;
  windowMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly maxBuckets = 50_000) {}

  consume(
    key: string,
    windowMs: number,
    maxRequests: number,
    nowEpochMs = Date.now()
  ): RateLimitDecision {
    this.cleanupExpired(nowEpochMs);

    const existing = this.buckets.get(key);
    if (!existing || nowEpochMs - existing.windowStartEpochMs >= windowMs) {
      const nextBucket: RateBucket = {
        count: 1,
        windowStartEpochMs: nowEpochMs,
        windowMs
      };
      this.buckets.set(key, nextBucket);
      this.evictIfOversized(nowEpochMs);

      return {
        allowed: true,
        remaining: Math.max(maxRequests - nextBucket.count, 0),
        retryAfterSeconds: 0,
        resetAtEpochMs: nextBucket.windowStartEpochMs + windowMs
      };
    }

    if (existing.count >= maxRequests) {
      const retryAfterMs = Math.max(
        existing.windowStartEpochMs + existing.windowMs - nowEpochMs,
        0
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1),
        resetAtEpochMs: existing.windowStartEpochMs + existing.windowMs
      };
    }

    existing.count += 1;
    this.buckets.set(key, existing);
    return {
      allowed: true,
      remaining: Math.max(maxRequests - existing.count, 0),
      retryAfterSeconds: 0,
      resetAtEpochMs: existing.windowStartEpochMs + existing.windowMs
    };
  }

  private cleanupExpired(nowEpochMs: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (nowEpochMs - bucket.windowStartEpochMs >= bucket.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  private evictIfOversized(nowEpochMs: number): void {
    if (this.buckets.size <= this.maxBuckets) {
      return;
    }

    for (const [key, bucket] of this.buckets.entries()) {
      if (nowEpochMs - bucket.windowStartEpochMs >= bucket.windowMs) {
        this.buckets.delete(key);
      }
      if (this.buckets.size <= this.maxBuckets) {
        break;
      }
    }

    if (this.buckets.size <= this.maxBuckets) {
      return;
    }

    const oldest = [...this.buckets.entries()].sort(
      (left, right) => left[1].windowStartEpochMs - right[1].windowStartEpochMs
    );
    const overBy = this.buckets.size - this.maxBuckets;
    for (let index = 0; index < overBy; index += 1) {
      const entry = oldest[index];
      if (!entry) {
        break;
      }
      this.buckets.delete(entry[0]);
    }
  }
}
