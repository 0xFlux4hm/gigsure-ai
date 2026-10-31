/**
 * Webhook handler — provider-agnostic confirmation of FundingRecord.
 *
 * Called by /api/payments/webhook/[provider]/route.ts AFTER the provider's
 * signature verification has passed. This module:
 *
 *   1. Looks up the FundingRecord by providerTxRef.
 *   2. Records the WebhookEvent (replay-protected via providerEventId uniqueness).
 *   3. Updates the FundingRecord status (INITIATED → PROVIDER_CONFIRMED | FAILED).
 *   4. If type=FUNDING and milestone-bound, advances milestone to FUNDED.
 *   5. If type=RELEASE, triggers initiatePayoutsForRelease() to disburse funds
 *      to the worker's bank account via the configured provider.
 *   6. Records an audit event.
 *
 * This module is provider-neutral: Monnify webhooks, OPay webhooks, and any
 * future provider all funnel through this same confirmation logic. Only the
 * signature verification differs per provider — that stays in the provider's
 * verifyWebhook() method.
 */
import { db } from "@/lib/db";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { initiatePayoutsForRelease } from "@/lib/payments/payout-service";

export type FundingStatus =
  | "DRAFT"
  | "INITIATED"
  | "PROVIDER_CONFIRMED"
  | "PARTIALLY_CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "DISPUTED";

export type ConfirmFundingInput = {
  provider: string; // "monnify" | "opay"
  providerEventId: string;
  providerTxRef: string;
  eventType: string;
  amountMinor: number;
  currency: string;
  status: FundingStatus;
  failureReason?: string;
  rawPayload: string;
  signatureValid: boolean;
  paymentTransactionId?: string; // optional link to PaymentTransaction if it exists
};

export type ConfirmFundingResult = {
  processed: boolean;
  reason?: string;
  fundingRecordId?: string;
};

/**
 * Idempotent webhook handler. Records the WebhookEvent for replay protection,
 * updates the linked FundingRecord, and triggers downstream actions
 * (milestone advancement, payouts).
 *
 * Safe to call multiple times with the same providerEventId — the second
 * call is a no-op.
 */
export async function confirmFundingRecord(
  input: ConfirmFundingInput,
): Promise<ConfirmFundingResult> {
  // Replay protection: if this providerEventId was already processed, bail.
  const existing = await db.webhookEvent.findUnique({
    where: { providerEventId: input.providerEventId },
  });
  if (existing) {
    return { processed: false, reason: "duplicate_event" };
  }

  // Locate the funding record by provider transaction reference.
  let record = await db.fundingRecord.findUnique({
    where: { providerTxRef: input.providerTxRef },
  });

  // Fallback for PayPal: if the funding record isn't found by providerTxRef
  // (which might be the capture ID instead of the order ID), try looking
  // up via the PaymentTransaction → milestoneId link.
  if (!record && input.provider === "paypal" && input.paymentTransactionId) {
    const tx = await db.paymentTransaction.findUnique({
      where: { id: input.paymentTransactionId },
      select: { milestoneId: true, projectId: true },
    });
    if (tx?.milestoneId) {
      // Find the most recent INITIATED funding record for this milestone
      record = await db.fundingRecord.findFirst({
        where: {
          milestoneId: tx.milestoneId,
          projectId: tx.projectId,
          status: "INITIATED",
        },
        orderBy: { initiatedAt: "desc" },
      });
    }
  }

  if (!record) {
    // Still record the webhook so we have evidence — but no funding update.
    await db.webhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        signatureValid: input.signatureValid,
        payload: input.rawPayload,
        paymentTransactionId: input.paymentTransactionId,
        processedAt: new Date(),
      },
    });
    return { processed: false, reason: "funding_record_not_found" };
  }

  // Amount validation: for PayPal cross-border payments, the webhook may
  // send the amount in USD (minor units) while the funding record is in NGN.
  // The verify endpoint already passes the correct NGN amount (from the
  // transaction), so we only need to handle the raw webhook case.
  const CROSS_BORDER_FX_RATE = 1500;
  let expectedAmount = input.amountMinor;
  if (input.provider === "paypal" && input.amountMinor !== record.amountMinor) {
    // Check if it's a raw USD amount that needs conversion
    if (input.amountMinor * CROSS_BORDER_FX_RATE === record.amountMinor) {
      expectedAmount = record.amountMinor;
    }
    // Check if it was double-converted
    else if (input.amountMinor / CROSS_BORDER_FX_RATE === record.amountMinor) {
      expectedAmount = record.amountMinor;
    }
  }

  if (expectedAmount !== record.amountMinor) {
    logSecurityEvent("warn", "webhook.amount_mismatch", {
      fundingRecordId: record.id,
      expected: record.amountMinor,
      received: input.amountMinor,
      provider: input.provider,
    });
    // Mark as DISPUTED instead of confirming
    await db.$transaction([
      db.webhookEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          signatureValid: input.signatureValid,
          payload: input.rawPayload,
          fundingRecordId: record.id,
          paymentTransactionId: input.paymentTransactionId,
          processedAt: new Date(),
        },
      }),
      db.fundingRecord.update({
        where: { id: record.id },
        data: {
          status: "DISPUTED",
          failureReason: `Amount mismatch: expected ${record.amountMinor}, received ${input.amountMinor}`,
        },
      }),
    ]);
    return { processed: false, reason: "amount_mismatch" };
  }

  // SECURITY: Enforce state machine transitions — don't allow reverting
  // a PROVIDER_CONFIRMED record back to INITIATED or FAILED
  const validTransitions: Record<string, Set<string>> = {
    INITIATED: new Set(["PROVIDER_CONFIRMED", "FAILED", "CANCELLED", "DISPUTED"]),
    PROVIDER_CONFIRMED: new Set(["DISPUTED"]),
    FAILED: new Set(["DISPUTED"]),
    CANCELLED: new Set([]),
    DISPUTED: new Set(["PROVIDER_CONFIRMED", "FAILED"]),
  };
  const allowed = validTransitions[record.status];
  if (allowed && !allowed.has(input.status)) {
    logSecurityEvent("warn", "webhook.invalid_transition", {
      fundingRecordId: record.id,
      from: record.status,
      to: input.status,
    });
    return { processed: false, reason: "invalid_transition" };
  }

  // Atomic update: record webhook + update funding status in one transaction
  await db.$transaction([
    db.webhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        signatureValid: input.signatureValid,
        payload: input.rawPayload,
        fundingRecordId: record.id,
        paymentTransactionId: input.paymentTransactionId,
        processedAt: new Date(),
      },
    }),
    db.fundingRecord.update({
      where: { id: record.id },
      data: {
        status: input.status,
        confirmedAt: input.status === "PROVIDER_CONFIRMED" ? new Date() : record.confirmedAt,
        failureReason: input.failureReason ?? null,
      },
    }),
  ]);

  // If milestone funding confirmed, advance milestone status
  if (
    input.status === "PROVIDER_CONFIRMED" &&
    record.milestoneId &&
    record.type === "FUNDING"
  ) {
    const milestone = await db.milestone.findUnique({
      where: { id: record.milestoneId },
      select: { id: true, status: true, title: true, amountMinor: true, currency: true },
    });
    if (milestone && milestone.status === "AWAITING_FUNDING") {
      await db.milestone.update({
        where: { id: milestone.id },
        data: { status: "FUNDED" },
      });

      // Notify project members that the milestone is funded
      const { notifyProjectMembers } = await import("@/lib/notifications");
      const amount = (milestone.amountMinor / 100).toLocaleString("en-NG", {
        style: "currency",
        currency: milestone.currency,
      });
      await notifyProjectMembers(record.projectId, record.initiatedById, {
        type: "MILESTONE_FUNDED",
        title: "Milestone funded",
        body: `"${milestone.title}" is now funded with ${amount}. Work can begin.`,
      });
    }
  }

  // If milestone release confirmed, trigger the actual payout(s) to the worker(s).
  // This is where the real money movement is initiated — the platform pays out
  // from its escrow balance to the worker's bank account via the provider.
  if (
    input.status === "PROVIDER_CONFIRMED" &&
    record.type === "RELEASE"
  ) {
    try {
      const payoutResult = await initiatePayoutsForRelease({
        projectId: record.projectId,
        milestoneId: record.milestoneId,
        fundingRecordId: record.id,
        initiatedById: record.initiatedById,
        totalAmountMinor: record.amountMinor,
        currency: record.currency,
      });

      await recordAuditEvent({
        actorId: record.initiatedById,
        projectId: record.projectId,
        fundingRecordId: record.id,
        action: "payout.batch_initiated",
        targetType: "FundingRecord",
        targetId: record.id,
        metadata: {
          payoutCount: payoutResult.payouts.length,
          totalDisbursedMinor: payoutResult.totalDisbursedMinor,
        },
      });
    } catch (err) {
      // Log the failure but don't roll back the funding record —
      // the release is confirmed by the provider, and the payout
      // failure will be visible in the Payouts dashboard for admin resolution.
      logSecurityEvent("error", "payout.batch_initiation_failed", {
        fundingRecordId: record.id,
        message: (err as Error)?.message,
      });
      await recordAuditEvent({
        actorId: record.initiatedById,
        projectId: record.projectId,
        fundingRecordId: record.id,
        action: "payout.batch_initiation_failed",
        targetType: "FundingRecord",
        targetId: record.id,
        metadata: { error: (err as Error)?.message },
      });
    }
  }

  await recordAuditEvent({
    actorId: record.initiatedById,
    projectId: record.projectId,
    fundingRecordId: record.id,
    action: `funding.${input.status.toLowerCase()}`,
    targetType: "FundingRecord",
    targetId: record.id,
    metadata: {
      providerEventId: input.providerEventId,
      signatureValid: input.signatureValid,
      provider: input.provider,
    },
  });

  return { processed: true, fundingRecordId: record.id };
}
