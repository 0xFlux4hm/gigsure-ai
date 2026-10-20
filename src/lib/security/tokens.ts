/**
 * Token & crypto utilities.
 *
 * - `generateToken()` returns a URL-safe cryptographically random token (32 bytes).
 * - `hashToken()` returns a SHA-256 hex digest; only the hash is stored.
 * - `constantTimeEqual()` for safe equality checks.
 *
 * We never log raw tokens, never include them in analytics, and never embed them
 * in URLs that get rendered as plain anchor text without expiring.
 */
import { randomBytes, createHash, timingSafeEqual, createHmac } from "crypto";

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function generateProviderTxRef(prefix = "GS"): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

export function generateIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Webhook signature verification. The mock payment provider uses HMAC-SHA256
 * with a shared secret. Real providers (Paystack, Flutterwave) have their own
 * schemes documented in `docs/PAYMENT_INTEGRATION.md`.
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = signWebhookPayload(payload, secret);
  return constantTimeEqual(expected, signature);
}
