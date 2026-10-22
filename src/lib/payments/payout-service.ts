/**
 * Payout service — orchestrates the real money movement from the platform
 * escrow to a worker's bank account when a milestone is released.
 *
 * Trigger: when a FundingRecord with type=RELEASE reaches PROVIDER_CONFIRMED
 * status, this service is invoked to:
 *   1. Resolve who should be paid (the milestone's compensation allocations
 *      or a single explicit payeeId).
 *   2. Look up each payee's default BankDetail.
 *   3. Call provider.initiateTransfer() to disburse funds.
 *   4. Persist a Payout record per payee with status PENDING.
 *
 * Provider webhooks (or manual /api/payouts/[id]/verify for admin) later
 * flip the Payout to SUCCEEDED or FAILED and advance the milestone to RELEASED.
 *
 * The service is idempotent: if a Payout with the same idempotencyKey already
 * exists, it's returned as-is rather than re-initiated.
 */
import { db } from "@/lib/db";
import { getProvider, getDefaultProvider } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/provider-interface";
import { generateProviderTxRef, generateIdempotencyKey } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";

export type PayoutRecipient = {
  userId: string;
  amountMinor: number;
  reason: string;
};

export type InitiatePayoutsInput = {
  projectId: string;
  milestoneId?: string | null;
  fundingRecordId: string; // the source FundingRecord (type=RELEASE) that triggered this payout
  initiatedById: string;
  payeeId?: string; // optional explicit single payee; otherwise split per compensation agreement
  totalAmountMinor: number;
  currency: string;
};

export type InitiatePayoutsResult = {
  payouts: Array<{
    id: string;
    payoutReference: string;
    payeeId: string;
    amountMinor: number;
    status: string;
    providerReference?: string;
    failureReason?: string;
  }>;
  totalDisbursedMinor: number;
};

/**
 * Resolve the payout recipients for a milestone release.
 *
 * Priority:
 *   1. If `payeeId` is explicit → single recipient at full amount.
 *   2. Else look up the latest ACCEPTED CompensationAgreement for the project.
 *      Each allocation receives `percentageBps / 10_000 * totalAmountMinor`.
 *   3. If no agreement exists → fall back to the project owner at full amount
 *      (the owner is then responsible for manually distributing).
 */
export async function resolvePayoutRecipients(
  projectId: string,
  totalAmountMinor: number,
  payeeId?: string,
  milestoneId?: string | null,
): Promise<PayoutRecipient[]> {
  if (payeeId) {
    return [
      {
        userId: payeeId,
        amountMinor: totalAmountMinor,
        reason: milestoneId ? "Milestone payout" : "Project payout",
      },
    ];
  }

  // Try compensation agreement.
  const agreement = await db.compensationAgreement.findFirst({
    where: { projectId, status: "ACCEPTED" },
    orderBy: { versionNumber: "desc" },
    include: { allocations: true },
  });

  if (agreement && agreement.allocations.length > 0) {
    const recipients: PayoutRecipient[] = agreement.allocations.map((a) => ({
      userId: a.userId,
      // Compute proportional share, ensuring the sum equals totalAmountMinor.
      // We use Math.floor for each recipient and assign the remainder to the
      // first allocation to avoid losing kobo to rounding.
      amountMinor: Math.floor((a.percentageBps / 10_000) * totalAmountMinor),
      reason: `${a.role} allocation (${a.percentageBps / 100}%)`,
    }));
    // Add rounding remainder to the first recipient.
    const distributed = recipients.reduce((s, r) => s + r.amountMinor, 0);
    const remainder = totalAmountMinor - distributed;
    if (remainder !== 0 && recipients.length > 0) {
      recipients[0].amountMinor += remainder;
    }
    return recipients;
  }

  // Fallback: project owner.
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) {
    throw new Error("Cannot resolve payout recipients: project not found");
  }
  return [
    {
      userId: project.ownerId,
      amountMinor: totalAmountMinor,
      reason: "Owner payout (no compensation agreement set)",
    },
  ];
}

/**
 * Initiate payouts to one or more workers for a milestone release.
 *
 * Idempotency: uses the fundingRecordId + payeeId as idempotency key. If a
 * payout already exists for that combination, it's returned unchanged.
 */
export async function initiatePayoutsForRelease(
  input: InitiatePayoutsInput,
): Promise<InitiatePayoutsResult> {
  const recipients = await resolvePayoutRecipients(
    input.projectId,
    input.totalAmountMinor,
    input.payeeId,
    input.milestoneId,
  );

  // Choose provider — always the configured default. No mock fallback.
  const provider: PaymentProvider = await getDefaultProvider();

  if (!provider.initiateTransfer) {
    throw new Error(
      `Provider ${provider.name} does not support payouts (initiateTransfer not implemented).`,
    );
  }

  const payouts: InitiatePayoutsResult["payouts"] = [];
  let totalDisbursedMinor = 0;

  for (const recipient of recipients) {
    // Skip zero-amount allocations (e.g., 0% share).
    if (recipient.amountMinor <= 0) continue;

    const idempotencyKey = `release-${input.fundingRecordId}-${recipient.userId}`;
    const payoutReference = generateProviderTxRef("GS_payout");

    // Idempotency: check if a payout already exists for this funding record + user.
    const existing = await db.payout.findFirst({
      where: { idempotencyKey },
      select: { id: true, payoutReference: true, status: true, amountMinor: true, providerReference: true, failureReason: true },
    });
    if (existing) {
      payouts.push({
        id: existing.id,
        payoutReference: existing.payoutReference,
        payeeId: recipient.userId,
        amountMinor: existing.amountMinor,
        status: existing.status,
        providerReference: existing.providerReference ?? undefined,
        failureReason: existing.failureReason ?? undefined,
      });
      totalDisbursedMinor += existing.amountMinor;
      continue;
    }

    // Look up the worker's default bank detail.
    const bankDetail = await db.bankDetail.findFirst({
      where: { userId: recipient.userId, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (!bankDetail) {
      // No bank account on file — record a FAILED payout so admin can resolve.
      const failedPayout = await db.payout.create({
        data: {
          payoutReference,
          projectId: input.projectId,
          milestoneId: input.milestoneId ?? null,
          payeeId: recipient.userId,
          initiatedById: input.initiatedById,
          provider: provider.name,
          amountMinor: recipient.amountMinor,
          feeMinor: 0,
          netMinor: recipient.amountMinor,
          currency: input.currency,
          bankDetailId: null,
          payeeAccountName: "",
          payeeAccountNumber: "",
          payeeBankCode: "",
          payeeBankName: "",
          status: "FAILED",
          failureReason:
            "Worker has no bank account on file. Worker must add a bank account in Settings before payouts can be initiated.",
          idempotencyKey,
          failedAt: new Date(),
        },
      });
      payouts.push({
        id: failedPayout.id,
        payoutReference: failedPayout.payoutReference,
        payeeId: recipient.userId,
        amountMinor: recipient.amountMinor,
        status: "FAILED",
        failureReason: failedPayout.failureReason ?? undefined,
      });
      logSecurityEvent("warn", "payout.no_bank_detail", {
        payeeId: recipient.userId,
        projectId: input.projectId,
        fundingRecordId: input.fundingRecordId,
      });
      continue;
    }

    // Snapshot the bank details into the payout (immutable — even if the
    // worker later changes their bank account, this payout's destination is locked).
    const payoutRecord = await db.payout.create({
      data: {
        payoutReference,
        projectId: input.projectId,
        milestoneId: input.milestoneId ?? null,
        payeeId: recipient.userId,
        initiatedById: input.initiatedById,
        provider: provider.name,
        amountMinor: recipient.amountMinor,
        feeMinor: 0,
        netMinor: recipient.amountMinor,
        currency: input.currency,
        bankDetailId: bankDetail.id,
        payeeAccountName: bankDetail.accountName,
        payeeAccountNumber: bankDetail.accountNumber,
        payeeBankCode: bankDetail.bankCode,
        payeeBankName: bankDetail.bankName,
        status: "PENDING",
        idempotencyKey,
      },
    });

    // Call provider to disburse.
    try {
      const result = await provider.initiateTransfer({
        payoutReference,
        amountMinor: recipient.amountMinor,
        currency: input.currency,
        recipient: {
          accountName: bankDetail.accountName,
          accountNumber: bankDetail.accountNumber,
          bankCode: bankDetail.bankCode,
          bankName: bankDetail.bankName,
        },
        narration: `GigSure payout — ${recipient.reason}`,
        metadata: {
          projectId: input.projectId,
          milestoneId: input.milestoneId,
          payeeId: recipient.userId,
          fundingRecordId: input.fundingRecordId,
        },
      });

      const updated = await db.payout.update({
        where: { id: payoutRecord.id },
        data: {
          providerReference: result.providerReference,
          status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
          settledAt: result.status === "SUCCEEDED" ? new Date() : null,
        },
      });

      payouts.push({
        id: updated.id,
        payoutReference: updated.payoutReference,
        payeeId: recipient.userId,
        amountMinor: updated.amountMinor,
        status: updated.status,
        providerReference: updated.providerReference ?? undefined,
      });
      totalDisbursedMinor += updated.amountMinor;

      await recordAuditEvent({
        actorId: input.initiatedById,
        projectId: input.projectId,
        payoutId: updated.id,
        action: "payout.initiated",
        targetType: "Payout",
        targetId: updated.id,
        metadata: {
          payeeId: recipient.userId,
          amountMinor: recipient.amountMinor,
          provider: provider.name,
          providerReference: result.providerReference,
        },
      });
    } catch (err) {
      // Mark payout as FAILED with the error reason.
      const failureReason = (err as Error)?.message ?? "Provider transfer failed";
      const updated = await db.payout.update({
        where: { id: payoutRecord.id },
        data: {
          status: "FAILED",
          failureReason,
          failedAt: new Date(),
        },
      });
      payouts.push({
        id: updated.id,
        payoutReference: updated.payoutReference,
        payeeId: recipient.userId,
        amountMinor: updated.amountMinor,
        status: "FAILED",
        failureReason,
      });
      logSecurityEvent("error", "payout.initiate_failed", {
        payoutId: updated.id,
        payeeId: recipient.userId,
        message: failureReason,
      });
    }
  }

  return { payouts, totalDisbursedMinor };
}

/**
 * Mark a payout as settled. Called by the payout webhook handler when the
 * provider confirms a successful transfer. Advances the milestone to RELEASED
 * if all payouts for that milestone are now SUCCEEDED.
 */
export async function markPayoutSucceeded(
  payoutId: string,
  settledAt: Date,
  providerReference?: string,
): Promise<void> {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, milestoneId: true, status: true, projectId: true },
  });
  if (!payout) return;
  if (payout.status === "SUCCEEDED") return; // idempotent

  await db.payout.update({
    where: { id: payoutId },
    data: {
      status: "SUCCEEDED",
      settledAt,
      ...(providerReference ? { providerReference } : {}),
    },
  });

  // If milestone-bound, check if all payouts for this milestone are now SUCCEEDED.
  if (payout.milestoneId) {
    const pending = await db.payout.count({
      where: { milestoneId: payout.milestoneId, status: { in: ["PENDING", "FAILED"] } },
    });
    if (pending === 0) {
      await db.milestone.update({
        where: { id: payout.milestoneId },
        data: { status: "RELEASED" },
      });
      await recordAuditEvent({
        actorId: undefined,
        projectId: payout.projectId,
        action: "milestone.released",
        targetType: "Milestone",
        targetId: payout.milestoneId,
        metadata: { reason: "all_payouts_settled" },
      });

      // Notify project members that the milestone is released
      const milestone = await db.milestone.findUnique({
        where: { id: payout.milestoneId },
        select: { title: true, amountMinor: true, currency: true },
      });
      if (milestone) {
        const { notifyProjectMembers } = await import("@/lib/notifications");
        await notifyProjectMembers(payout.projectId, null, {
          type: "MILESTONE_RELEASED",
          title: "Milestone released",
          body: `"${milestone.title}" has been released. Funds have been paid out to the service provider(s).`,
        });
      }

      // Check if ALL milestones on the project are now RELEASED → auto-complete the project
      const totalMilestones = await db.milestone.count({
        where: { projectId: payout.projectId },
      });
      const releasedMilestones = await db.milestone.count({
        where: { projectId: payout.projectId, status: "RELEASED" },
      });
      if (totalMilestones > 0 && totalMilestones === releasedMilestones) {
        await db.project.update({
          where: { id: payout.projectId },
          data: { status: "COMPLETED" },
        });
        await recordAuditEvent({
          actorId: undefined,
          projectId: payout.projectId,
          action: "project.completed",
          targetType: "Project",
          targetId: payout.projectId,
          metadata: { reason: "all_milestones_released", milestoneCount: totalMilestones },
        });

        // Notify all project members that the project is complete
        const { notifyProjectMembers } = await import("@/lib/notifications");
        await notifyProjectMembers(payout.projectId, null, {
          type: "PROJECT_COMPLETED",
          title: "Project completed! 🎉",
          body: "All milestones have been released and payouts completed. Thank you for using GigSure AI.",
        });
      }
    }
  }
}

/**
 * Mark a payout as failed. Called by the payout webhook handler when the
 * provider reports a transfer failure.
 */
export async function markPayoutFailed(
  payoutId: string,
  failureReason: string,
): Promise<void> {
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, milestoneId: true, projectId: true },
  });
  if (!payout) return;
  if (payout.status === "FAILED" || payout.status === "SUCCEEDED") return; // idempotent

  await db.payout.update({
    where: { id: payoutId },
    data: {
      status: "FAILED",
      failureReason,
      failedAt: new Date(),
    },
  });

  await recordAuditEvent({
    actorId: undefined,
    projectId: payout.projectId,
    payoutId,
    action: "payout.failed",
    targetType: "Payout",
    targetId: payoutId,
    metadata: { reason: failureReason },
  });
}

/**
 * Generate a fresh idempotency key for clients that need to construct one
 * outside of `initiatePayoutsForRelease`.
 */
export function newIdempotencyKey(): string {
  return generateIdempotencyKey();
}
