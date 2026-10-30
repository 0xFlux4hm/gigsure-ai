/**
 * Provider-specific webhook endpoint.
 *
 * URL: /api/payments/webhook/[provider]
 *   - /api/payments/webhook/monnify
 *   - /api/payments/webhook/opay
 *   - /api/payments/webhook/paypal  (HACKATHON: PayPal AI Hackathon integration)
 *
 * Each provider has its own signature verification scheme:
 *   - Monnify: HMAC-SHA512 with API key, signature in `monnify-signature` header
 *   - OPay: HMAC-SHA512 with private key, signature in body's `sign` field
 *   - PayPal: Official verify-webhook-signature API (HACKATHON — async verification
 *     via POST /v1/notifications/verify-webhook-signature). See paypal-provider.ts.
 *
 * Security:
 *   1. Verify signature using raw body (not parsed JSON)
 *   2. Check replay (providerEventId uniqueness)
 *   3. Check timestamp (5-min replay window)
 *   4. Update PaymentTransaction status transactionally
 *   5. Create ledger entries atomically
 *   6. Confirm linked FundingRecord + trigger payouts (for RELEASE records)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments/registry";
import { isValidTransition } from "@/lib/payments/provider-interface";
import { confirmFundingRecord } from "@/lib/payments/webhook-handler";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";

const MAX_BODY_BYTES = 64 * 1024;
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;

  // Validate provider name — only real providers allowed.
  // HACKATHON: added "paypal" for the PayPal AI Hackathon integration.
  if (providerName !== "monnify" && providerName !== "opay" && providerName !== "paypal") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  // Body size limit
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  // Get provider + verify webhook signature
  const provider = getProvider(providerName);
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // HACKATHON: PayPal's verifyWebhook is async (calls PayPal's verification API).
  // Monnify/OPay return synchronously.
  const verification = await Promise.resolve(provider.verifyWebhook(rawBody, headers));

  if (!verification.valid) {
    logSecurityEvent("warn", "payment.webhook_invalid_signature", {
      provider: providerName,
    });
    // Return 200 to prevent retry storms (per security best practice)
    return NextResponse.json({ received: false }, { status: 200 });
  }

  // Parse the payload
  let payload: {
    event?: string;
    eventType?: string;
    event_type?: string; // HACKATHON: PayPal uses snake_case `event_type`
    provider_event_id?: string;
    provider_tx_ref?: string;
    transactionReference?: string;
    id?: string; // HACKATHON: PayPal webhook event ID
    amount?: number;
    amount_minor?: number;
    currency?: string;
    status?: string;
    timestamp?: string;
    create_time?: string; // HACKATHON: PayPal uses `create_time` for the event time
    paymentMethod?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // HACKATHON: PayPal webhook events put the timestamp in `create_time`.
  // Normalize so the replay-window check below works for all providers.
  const normalizedTimestamp = payload.timestamp ?? payload.create_time;
  const normalizedEventType = verification.eventType ?? payload.event_type ?? payload.eventType ?? "";
  const normalizedEventId =
    payload.provider_event_id ?? payload.id ?? `${providerName}_${normalizedEventType}_${verification.providerReference}`;

  // reject negative amounts in webhook payloads (defense-in-depth)
  if (payload.amount_minor !== undefined) {
    if (!Number.isFinite(payload.amount_minor) || payload.amount_minor < 0) {
      logSecurityEvent("warn", "payment.webhook_negative_amount", { provider: providerName });
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
  }

  // SECURITY: Validate timestamp for replay protection (5-minute window)
  // Timestamp is REQUIRED — reject webhooks without it
  if (!normalizedTimestamp) {
    logSecurityEvent("warn", "payment.webhook_missing_timestamp", { provider: providerName });
    return NextResponse.json({ error: "Missing timestamp" }, { status: 400 });
  }
  const ts = Date.parse(normalizedTimestamp);
  if (!Number.isFinite(ts)) {
    logSecurityEvent("warn", "payment.webhook_invalid_timestamp", { provider: providerName });
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }
  const ageMs = Math.abs(Date.now() - ts);
  if (ageMs > REPLAY_WINDOW_MS) {
    logSecurityEvent("warn", "payment.webhook_replay_rejected", {
      provider: providerName,
      ageMs,
    });
    return NextResponse.json({ error: "Payload expired" }, { status: 401 });
  }

  // SECURITY: Use deterministic providerEventId to prevent replay attacks.
  // If the provider doesn't send one, derive it from the reference + event type
  // + timestamp so identical replays are deduped.
  // NEVER use Date.now() — it makes every replay unique, defeating dedup.
  const providerReference =
    verification.providerReference ||
    payload.provider_tx_ref ||
    payload.transactionReference ||
    "";
  const providerEventId =
    payload.provider_event_id ??
    payload.id ??
    `${providerName}_${providerReference || "unknown"}_${normalizedEventType}_${normalizedTimestamp}`;

  // Replay protection
  const existing = await db.webhookEvent.findUnique({
    where: { providerEventId },
  });
  if (existing) {
    return NextResponse.json({ ok: true, processed: false, reason: "duplicate_event" });
  }

  // HACKATHON: For PayPal, the amount is in the `resource.amount.total` field.
  // For Monnify/OPay, it's already in `amount_minor` or `amount`.
  // The confirmFundingRecord call below uses `payload.amount_minor ?? Math.round((payload.amount ?? 0) * 100)`
  // so we need to extract PayPal's amount and put it in `amount_minor`.
  if (providerName === "paypal" && !payload.amount_minor) {
    try {
      const paypalEvent = JSON.parse(rawBody) as {
        resource?: {
          amount?: { total?: string; value?: string; currency?: string };
        };
      };
      const amountStr = paypalEvent.resource?.amount?.total ?? paypalEvent.resource?.amount?.value;
      if (amountStr) {
        const amountMinor = Math.round(parseFloat(amountStr) * 100);
        payload.amount_minor = amountMinor;
        if (!payload.currency && paypalEvent.resource?.amount?.currency) {
          payload.currency = paypalEvent.resource.amount.currency;
        }
      }
    } catch {
      // Already parsed above; this should never fail
    }
  }

  // Find the payment transaction by provider reference
  const transaction = await db.paymentTransaction.findFirst({
    where: { providerReference },
  });

  if (!transaction) {
    // No PaymentTransaction — but there may still be a FundingRecord
    // (e.g., reserved-account funding doesn't always create a PaymentTransaction).
    // Confirm the FundingRecord if it exists; record the webhook otherwise.
    try {
      const result = await confirmFundingRecord({
        provider: providerName,
        providerEventId,
        providerTxRef: providerReference,
        eventType: normalizedEventType,
        amountMinor: payload.amount_minor ?? Math.round((payload.amount ?? 0) * 100),
        currency: payload.currency ?? "NGN",
        status: mapEventToFundingStatus(normalizedEventType, payload.status),
        rawPayload: rawBody,
        signatureValid: true,
      });

      if (result.processed) {
        return NextResponse.json({ ok: true, processed: true, fundingRecordId: result.fundingRecordId });
      }
    } catch (err) {
      logSecurityEvent("error", "payment.webhook_funding_confirm_failed", {
        provider: providerName,
        providerReference,
        message: (err as Error)?.message,
      });
    }

    // Record webhook even if no transaction (for audit trail)
    await db.webhookEvent.create({
      data: {
        provider: providerName,
        providerEventId,
        eventType: verification.eventType,
        signatureValid: true,
        payload: rawBody,
        processedAt: new Date(),
      },
    });
    logSecurityEvent("warn", "payment.webhook_no_transaction", {
      provider: providerName,
      providerReference,
    });
    return NextResponse.json({ ok: true, processed: false, reason: "transaction_not_found" });
  }

  // Determine new payment status from webhook
  const eventType = verification.eventType || payload.event || "";
  let newStatus: string = transaction.status;

  if (eventType.includes("success") || eventType.includes("confirmed") || payload.status === "SUCCESS" || payload.status === "PAID") {
    newStatus = "SUCCEEDED";
  } else if (eventType.includes("fail") || payload.status === "FAIL" || payload.status === "FAILED") {
    newStatus = "FAILED";
  } else if (eventType.includes("expire") || payload.status === "CLOSE" || payload.status === "EXPIRED") {
    newStatus = "EXPIRED";
  } else if (eventType.includes("cancel") || payload.status === "CANCEL") {
    newStatus = "CANCELED";
  } else if (eventType.includes("refund")) {
    newStatus = "REFUND_PENDING";
  }

  // Validate state transition
  if (newStatus !== transaction.status && !isValidTransition(transaction.status as never, newStatus as never)) {
    logSecurityEvent("warn", "payment.webhook_invalid_transition", {
      transactionId: transaction.id,
      from: transaction.status,
      to: newStatus,
    });
    // Record the webhook but don't update the transaction
    await db.webhookEvent.create({
      data: {
        provider: providerName,
        providerEventId,
        eventType,
        signatureValid: true,
        payload: rawBody,
        paymentTransactionId: transaction.id,
        processedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, processed: false, reason: "invalid_transition" });
  }

  // Atomic update: webhook record + transaction status update + ledger entries
  await db.$transaction(async (tx) => {
    // Record webhook event
    await tx.webhookEvent.create({
      data: {
        provider: providerName,
        providerEventId,
        eventType,
        signatureValid: true,
        payload: rawBody,
        paymentTransactionId: transaction.id,
        processedAt: new Date(),
      },
    });

    // Update transaction status
    if (newStatus !== transaction.status) {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: newStatus,
          paidAt: newStatus === "SUCCEEDED" ? new Date() : undefined,
          paymentMethod: payload.paymentMethod ?? undefined,
        },
      });

      // If payment succeeded, create settlement ledger entry
      if (newStatus === "SUCCEEDED") {
        await tx.ledgerEntry.create({
          data: {
            transactionId: transaction.id,
            entryType: "SETTLEMENT",
            amountMinor: transaction.netMinor,
            currency: transaction.currency,
            accountType: "PROJECT_LIABILITY",
            description: `Payment confirmed — net to service provider: ${transaction.netMinor} ${transaction.currency}`,
          },
        });
      }
    }
  });

  // Audit
  await recordAuditEvent({
    actorId: transaction.userId,
    projectId: transaction.projectId,
    action: `payment.webhook.${newStatus.toLowerCase()}`,
    targetType: "PaymentTransaction",
    targetId: transaction.id,
    metadata: {
      provider: providerName,
      providerEventId,
      providerReference,
      newStatus,
    },
  });

  // Notify user
  await db.notification.create({
    data: {
      userId: transaction.userId,
      projectId: transaction.projectId,
      type: "PAYMENT",
      title:
        newStatus === "SUCCEEDED"
          ? "Payment confirmed"
          : newStatus === "FAILED"
          ? "Payment failed"
          : `Payment ${newStatus.toLowerCase()}`,
      body:
        newStatus === "SUCCEEDED"
          ? `Your payment of ${transaction.amountMinor / 100} ${transaction.currency} has been confirmed.`
          : newStatus === "FAILED"
          ? `Your payment of ${transaction.amountMinor / 100} ${transaction.currency} failed. Please try again.`
          : `Payment status updated to ${newStatus}.`,
    },
  });

  // CRITICAL: Confirm the linked FundingRecord (if any) and trigger payouts
  // for RELEASE records. This is what actually moves money to the worker's
  // bank account — without this block, milestone releases never pay out.
  try {
    await confirmFundingRecord({
      provider: providerName,
      providerEventId: `${providerEventId}_funding`,
      providerTxRef: providerReference,
      eventType: verification.eventType,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      status: mapEventToFundingStatus(verification.eventType, payload.status),
      rawPayload: rawBody,
      signatureValid: true,
      paymentTransactionId: transaction.id,
    });
  } catch (err) {
    logSecurityEvent("error", "payment.webhook_funding_confirm_failed", {
      provider: providerName,
      providerReference,
      transactionId: transaction.id,
      message: (err as Error)?.message,
    });
  }

  return NextResponse.json({ ok: true, processed: true });
}

function mapEventToFundingStatus(eventType: string, payloadStatus?: string): "PROVIDER_CONFIRMED" | "FAILED" | "INITIATED" {
  const combined = `${eventType} ${payloadStatus ?? ""}`.toLowerCase();
  // Success markers (Monnify, OPay, PayPal):
  //   - "success", "confirmed", "paid" (generic)
  //   - "payment.capture.completed" (PayPal's PAYMENT.CAPTURE.COMPLETED event)
  //   - "completed" (PayPal capture status)
  if (combined.includes("success") || combined.includes("confirmed") || combined.includes("paid") || combined.includes("completed")) {
    return "PROVIDER_CONFIRMED";
  }
  // Failure markers:
  //   - "fail", "expired", "cancel" (generic)
  //   - "denied" (PayPal PAYMENT.CAPTURE.DENIED event)
  //   - "voided" (PayPal order VOIDED)
  if (combined.includes("fail") || combined.includes("expired") || combined.includes("cancel") || combined.includes("denied") || combined.includes("voided")) {
    return "FAILED";
  }
  return "INITIATED";
}
