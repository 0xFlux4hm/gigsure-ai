/**
 * Mock payment provider webhook receiver.
 *
 * Verifies:
 *   1. HMAC signature against provider-specific secret (provider spoofing defense)
 *   2. Replay window — payload timestamp must be within 5 minutes of now
 *   3. Replay protection via unique providerEventId
 *
 * Real providers (Paystack, Flutterwave) use the same shape but with their
 * own signature schemes — see `docs/PAYMENT_INTEGRATION.md`.
 */
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/security/tokens";
import { processWebhookEvent, MOCK_PROVIDER_NAME, MOCK_WEBHOOK_SECRET } from "@/lib/payments/mock-provider";
import { logSecurityEvent } from "@/lib/auth/audit";

// SECURITY: provider → secret mapping. Prevents an attacker who learns one
// provider's secret from forging events attributed to a different provider.
// When real providers are integrated, add them here with their own secrets.
const PROVIDER_SECRETS: Record<string, string> = {
  [MOCK_PROVIDER_NAME]: MOCK_WEBHOOK_SECRET,
  // paystack: process.env.PAYSTACK_WEBHOOK_SECRET ?? "",
  // flutterwave: process.env.FLUTTERWAVE_WEBHOOK_SECRET ?? "",
};

const MAX_BODY_BYTES = 64 * 1024; // 64 KiB — webhooks are small JSON payloads
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: Request) {
  // SECURITY: body-size limit (defense against memory-exhaustion DoS).
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const signature = req.headers.get("x-gigsure-signature") ?? "";
  const providerHeader = req.headers.get("x-gigsure-provider") ?? MOCK_PROVIDER_NAME;
  const simulated = req.headers.get("x-gigsure-simulated") === "true";

  // SECURITY: look up secret by provider. Reject unknown providers.
  const providerSecret = PROVIDER_SECRETS[providerHeader];
  if (!providerSecret) {
    logSecurityEvent("warn", "webhook.unknown_provider", { provider: providerHeader });
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const signatureValid = verifyWebhookSignature(raw, signature, providerSecret);
  if (!signatureValid) {
    logSecurityEvent("warn", "webhook.invalid_signature", { provider: providerHeader, simulated });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event: string;
    provider_event_id: string;
    provider_tx_ref: string;
    amount_minor: number;
    currency: string;
    type: string;
    timestamp?: string;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // SECURITY: replay window — reject payloads older than 5 minutes.
  // The mock provider includes a `timestamp` field in every payload.
  if (payload.timestamp) {
    const payloadTime = Date.parse(payload.timestamp);
    if (!Number.isFinite(payloadTime)) {
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
    }
    const ageMs = Math.abs(Date.now() - payloadTime);
    if (ageMs > REPLAY_WINDOW_MS) {
      logSecurityEvent("warn", "webhook.replay_rejected", {
        provider: providerHeader,
        ageMs,
      });
      return NextResponse.json({ error: "Payload expired" }, { status: 401 });
    }
  }

  const status =
    payload.event === "funding.confirmed" ? "PROVIDER_CONFIRMED" :
    payload.event === "funding.failed" ? "FAILED" :
    "INITIATED";

  const result = await processWebhookEvent({
    provider: providerHeader,
    providerEventId: payload.provider_event_id,
    providerTxRef: payload.provider_tx_ref,
    eventType: payload.event,
    amountMinor: payload.amount_minor,
    currency: payload.currency,
    status: status as "PROVIDER_CONFIRMED" | "FAILED",
    rawPayload: raw,
    signatureValid,
  });

  return NextResponse.json({ ok: true, processed: result.processed, reason: result.reason });
}
