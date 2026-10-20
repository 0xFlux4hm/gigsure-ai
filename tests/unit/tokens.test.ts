/**
 * Token + crypto utility tests.
 */
import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  constantTimeEqual,
  signWebhookPayload,
  verifyWebhookSignature,
  generateProviderTxRef,
  generateIdempotencyKey,
} from "@/lib/security/tokens";

describe("token generation", () => {
  it("generates URL-safe random tokens", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
  });

  it("generates unique tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });

  it("hashes tokens deterministically (SHA-256)", () => {
    const t = "abc123";
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("constant-time comparison", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for unequal strings", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("webhook signature verification", () => {
  const SECRET = "test-webhook-secret";

  it("signs and verifies a payload", () => {
    const payload = JSON.stringify({ event: "funding.confirmed", amount: 1000 });
    const signature = signWebhookPayload(payload, SECRET);
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const payload = JSON.stringify({ event: "funding.confirmed", amount: 1000 });
    const signature = signWebhookPayload(payload, SECRET);
    const tampered = JSON.stringify({ event: "funding.confirmed", amount: 9999 });
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const payload = "test";
    const signature = signWebhookPayload(payload, "wrong-secret");
    expect(verifyWebhookSignature(payload, signature, SECRET)).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifyWebhookSignature("test", "", SECRET)).toBe(false);
  });

  it("rejects empty secret", () => {
    const sig = signWebhookPayload("test", "somesecret");
    expect(verifyWebhookSignature("test", sig, "")).toBe(false);
  });
});

describe("provider references", () => {
  it("generates unique provider tx refs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateProviderTxRef());
    expect(seen.size).toBe(100);
  });

  it("generates unique idempotency keys", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateIdempotencyKey());
    expect(seen.size).toBe(100);
  });
});
