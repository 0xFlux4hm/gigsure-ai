/**
 * Rate limiter for sensitive endpoints.
 *
 * Two implementations:
 *   - `InMemoryRateLimiter` (default): works in single-process deployments
 *   - `RedisRateLimiter` (interface): production-ready for multi-instance
 *
 * Configuration via env:
 *   - RATE_LIMIT_BACKEND=memory|redis (default: memory)
 *   - REDIS_URL=redis://... (required if backend=redis)
 *
 * Limits enforced (per-IP and per-identifier):
 *   - Login:                5 attempts / 15 min / per email
 *                          20 attempts / 15 min / per IP
 *   - Register:             3 / hour / per IP
 *   - Forgot password:      3 / 10 min / per email (already in route)
 *   - Resend verification:   3 / 10 min / per email (already in route)
 *   - Password reset:       5 / hour / per IP
 *   - AI assistant:         20 / min / per user
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (single-process)
// ---------------------------------------------------------------------------

type Bucket = { count: number; firstAt: number };

export class InMemoryRateLimiter implements RateLimiter {
  private store = new Map<string, Bucket>();

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now - existing.firstAt >= windowMs) {
      // Fresh window
      this.store.set(key, { count: 1, firstAt: now });
      return { ok: true, remaining: limit - 1, resetAt: now + windowMs, limit };
    }

    existing.count += 1;
    if (existing.count > limit) {
      return { ok: false, remaining: 0, resetAt: existing.firstAt + windowMs, limit };
    }

    return {
      ok: true,
      remaining: limit - existing.count,
      resetAt: existing.firstAt + windowMs,
      limit,
    };
  }

  // Optional: clean up expired buckets periodically (called by setInterval)
  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.store.entries()) {
      // Conservative: keep buckets for 2x their window to avoid premature eviction
      if (now - bucket.firstAt > 2 * 60 * 60 * 1000) {
        this.store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Redis implementation (production)
// ---------------------------------------------------------------------------

export class RedisRateLimiter implements RateLimiter {
  private redis: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<void> };

  constructor(redis: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<void> }) {
    this.redis = redis;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, Math.ceil(windowMs / 1000));
    }
    const remaining = Math.max(0, limit - count);
    const ok = count <= limit;
    return { ok, remaining, resetAt: Date.now() + windowMs, limit };
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _limiter: RateLimiter | null = null;
let _cleanupTimer: NodeJS.Timeout | null = null;

export function getRateLimiter(): RateLimiter {
  if (_limiter) return _limiter;

  const backend = process.env.RATE_LIMIT_BACKEND ?? "memory";

  if (backend === "redis") {
    // Lazy load Redis client only if requested
    throw new Error(
      "Redis rate limiter not configured. Install 'ioredis' and instantiate RedisRateLimiter with a real client.",
    );
  }

  // Default: in-memory
  const mem = new InMemoryRateLimiter();
  // Run cleanup every 5 minutes
  if (!_cleanupTimer) {
    _cleanupTimer = setInterval(() => mem.cleanup(), 5 * 60 * 1000);
    _cleanupTimer.unref?.();
  }
  _limiter = mem;
  return _limiter;
}

// ---------------------------------------------------------------------------
// Pre-defined limits
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  LOGIN_PER_EMAIL: { limit: 5, windowMs: 15 * 60 * 1000 },
  LOGIN_PER_IP: { limit: 20, windowMs: 15 * 60 * 1000 },
  REGISTER_PER_IP: { limit: 3, windowMs: 60 * 60 * 1000 },
  FORGOT_PASSWORD_PER_EMAIL: { limit: 3, windowMs: 10 * 60 * 1000 },
  RESEND_VERIFICATION_PER_EMAIL: { limit: 3, windowMs: 10 * 60 * 1000 },
  RESET_PASSWORD_PER_IP: { limit: 5, windowMs: 60 * 60 * 1000 },
  AI_ASSISTANT_PER_USER: { limit: 20, windowMs: 60 * 1000 },
  AI_ASSISTANT_PER_IP: { limit: 30, windowMs: 60 * 1000 },
} as const;

export async function checkRateLimit(
  key: string,
  config: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const limiter = getRateLimiter();
  return limiter.check(key, config.limit, config.windowMs);
}

/** Build standard rate-limit headers for client visibility. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": result.ok ? "0" : String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}
