/**
 * Rate limiter tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  it("allows first request", async () => {
    const result = await limiter.check("test-key", 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("blocks after limit exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await limiter.check("test-key", 5, 60_000);
      expect(r.ok).toBe(true);
    }
    const result = await limiter.check("test-key", 5, 60_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.check("test-key", 3, 100);
    }
    const blocked = await limiter.check("test-key", 3, 100);
    expect(blocked.ok).toBe(false);

    await new Promise((r) => setTimeout(r, 150));

    const after = await limiter.check("test-key", 3, 100);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("tracks different keys independently", async () => {
    await limiter.check("user1", 5, 60_000);
    await limiter.check("user1", 5, 60_000);
    const r1 = await limiter.check("user1", 5, 60_000);
    const r2 = await limiter.check("user2", 5, 60_000);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(4);
  });

  it("RATE_LIMITS has sensible values", () => {
    expect(RATE_LIMITS.LOGIN_PER_EMAIL.limit).toBeGreaterThanOrEqual(3);
    expect(RATE_LIMITS.LOGIN_PER_IP.limit).toBeGreaterThanOrEqual(RATE_LIMITS.LOGIN_PER_EMAIL.limit);
    expect(RATE_LIMITS.AI_ASSISTANT_PER_USER.limit).toBeGreaterThan(0);
  });
});
