/**
 * Mock payment provider webhook receiver.
 *
 * Verifies HMAC signature + replay protection (via providerEventId).
 * The mock provider posts here asynchronously via fetch after `initiateFunding()`.
 *
 * Real providers (Paystack, Flutterwave) use the same shape but with their
 * own signature schemes — see `docs/PAYMENT_INTEGRATION.md`.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/security/tokens";
import { processWebhookEvent, MOCK_PROVIDER_NAME, MOCK_WEBHOOK_SECRET } from "@/lib/payments/mock-provider";
import { logSecurityEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-gigsure-signature") ?? "";
  const provider = req.headers.get("x-gigsure-provider") ?? MOCK_PROVIDER_NAME;
  const simulated = req.headers.get("x-gigsure-simulated") === "true";

  const signatureValid = verifyWebhookSignature(raw, signature, MOCK_WEBHOOK_SECRET);
  if (!signatureValid) {
    logSecurityEvent("warn", "webhook.invalid_signature", { provider, simulated });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event: string;
    provider_event_id: string;
    provider_tx_ref: string;
    amount_minor: number;
    currency: string;
    type: string;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status =
    payload.event === "funding.confirmed" ? "PROVIDER_CONFIRMED" :
    payload.event === "funding.failed" ? "FAILED" :
    "INITIATED";

  const result = await processWebhookEvent({
    provider,
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
