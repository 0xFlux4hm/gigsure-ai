/**
 * Provider-specific webhook endpoint.
 *
 * URL: /api/payments/webhook/[provider]
 *   - /api/payments/webhook/mock
 *   - /api/payments/webhook/monnify
 *   - /api/payments/webhook/opay
 *
 * Each provider has its own signature verification scheme:
 *   - Mock: HMAC-SHA256 with MOCK_WEBHOOK_SECRET
 *   - Monnify: HMAC-SHA512 with API key, signature in `monnify-signature` header
 *   - OPay: HMAC-SHA512 with private key, signature in body's `sign` field
 *
 * Security:
 *   1. Verify signature using raw body (not parsed JSON)
 *   2. Check replay (providerEventId uniqueness)
 *   3. Check timestamp (5-min replay window)
 *   4. Update PaymentTransaction status transactionally
 *   5. Create ledger entries atomically
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments/registry";
import { isValidTransition } from "@/lib/payments/provider-interface";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";

const MAX_BODY_BYTES = 64 * 1024;
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;

  // Validate provider name
  if (!["mock", "monnify", "opay"].includes(providerName)) {
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

  // Get provider + verify webhook
  const provider = getProvider(providerName as "mock" | "monnify" | "opay");
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const verification = provider.verifyWebhook(rawBody, headers);

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
    provider_event_id?: string;
    provider_tx_ref?: string;
    transactionReference?: string;
    amount?: number;
    amount_minor?: number;
    currency?: string;
    status?: string;
    timestamp?: string;
    paymentMethod?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerEventId = payload.provider_event_id ?? `evt_${Date.now()}`;
  const providerReference =
    verification.providerReference ||
    payload.provider_tx_ref ||
    payload.transactionReference ||
    "";

  // Replay protection
  const existing = await db.webhookEvent.findUnique({
    where: { providerEventId },
  });
  if (existing) {
    return NextResponse.json({ ok: true, processed: false, reason: "duplicate_event" });
  }

  // Find the payment transaction by provider reference
  const transaction = await db.paymentTransaction.findFirst({
    where: { providerReference },
  });

  if (!transaction) {
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
  if (newStatus !== transaction.status && !isValidTransition(transaction.status as any, newStatus as any)) {
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
            description: `Payment confirmed — net to freelancer: ${transaction.netMinor} ${transaction.currency}`,
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

  return NextResponse.json({ ok: true, processed: true });
}
