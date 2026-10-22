/**
 * List & initiate funding records.
 *
 * Types:
 *   - FUNDING: client funds milestone (via virtual account or hosted checkout).
 *   - RELEASE: milestone approved → owner can release funds to collaborator.
 *   - REFUND: client can request refund (only on FUNDING records that are PROVIDER_CONFIRMED).
 *
 * Idempotency: each request returns the same record for the same idempotencyKey.
 *
 * Note: This endpoint creates the FundingRecord row in INITIATED status.
 * For FUNDING records, the client then funds via the virtual account at
 * /api/projects/[id]/virtual-account OR via hosted checkout at
 * /api/payments/initiate. When the provider's webhook confirms the payment,
 * the FundingRecord is advanced to PROVIDER_CONFIRMED by webhook-handler.ts.
 *
 * For RELEASE records, the FundingRecord is confirmed synchronously (the
 * release is initiated by the project owner who has already approved the
 * milestone). Webhook handler then triggers payouts to the worker.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { createFundingRecord } from "@/lib/payments/funding-service";
import { confirmFundingRecord } from "@/lib/payments/webhook-handler";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { isUserKycVerified } from "@/lib/kyc/provider";
import { z } from "zod";

const Schema = z.object({
  type: z.enum(["FUNDING", "RELEASE", "REFUND"]),
  milestoneId: z.string().cuid().optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.string().max(128).optional(),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const records = await db.fundingRecord.findMany({
    where: { projectId: params.id },
    include: { milestone: { select: { id: true, title: true } }, webhookEvents: true },
    orderBy: { initiatedAt: "desc" },
    take: 100,
  });
  return { fundingRecords: records };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "funding:initiate");

  // require KYC verification before any funding transaction
  const kycVerified = await isUserKycVerified(userId);
  if (!kycVerified) {
    return fail(
      "KYC verification required before participating in funding transactions. Please complete KYC verification in your account settings.",
      403,
    );
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid funding request", 422);
  }

  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { id: true, currency: true },
  });
  if (!project) return fail("Project not found", 404);

  // If milestone-bound, validate milestone belongs to project + check status.
  let milestone: { id: string; status: string; amountMinor: number; projectId: string } | null = null;
  if (parsed.data.milestoneId) {
    milestone = await db.milestone.findUnique({
      where: { id: parsed.data.milestoneId },
      select: { id: true, status: true, amountMinor: true, projectId: true },
    });
    if (!milestone || milestone.projectId !== params.id) {
      return fail("Milestone not found in this project", 404);
    }
    if (parsed.data.type === "FUNDING" && !["DRAFT", "AWAITING_FUNDING"].includes(milestone.status)) {
      return fail(`Milestone cannot be funded in status: ${milestone.status}`, 400);
    }
    if (parsed.data.type === "FUNDING" && parsed.data.amountMinor !== milestone.amountMinor) {
      return fail(
        `Funding amount must match milestone amount exactly. Expected: ${milestone.amountMinor}, got: ${parsed.data.amountMinor}`,
        400,
      );
    }
    if (parsed.data.type === "RELEASE" && milestone.status !== "APPROVED") {
      return fail(`Milestone must be APPROVED to release (current: ${milestone.status})`, 400);
    }
    // SECURITY: Validate RELEASE amount does not exceed milestone funded amount
    if (parsed.data.type === "RELEASE" && parsed.data.amountMinor > milestone.amountMinor) {
      return fail(
        `Release amount (${parsed.data.amountMinor}) exceeds milestone amount (${milestone.amountMinor})`,
        400,
      );
    }
    // REFUND requires an existing PROVIDER_CONFIRMED FUNDING record.
    // Refund amount must not exceed the original funding amount.
    if (parsed.data.type === "REFUND") {
      const originalFunding = await db.fundingRecord.findFirst({
        where: {
          milestoneId: parsed.data.milestoneId,
          type: "FUNDING",
          status: "PROVIDER_CONFIRMED",
        },
        select: { id: true, amountMinor: true },
      });
      if (!originalFunding) {
        return fail("Cannot refund: no confirmed funding record for this milestone", 400);
      }
      if (parsed.data.amountMinor > originalFunding.amountMinor) {
        return fail("Refund amount exceeds original funding amount", 400);
      }
    }
    // Block release if dispute is open on this milestone.
    const openDispute = await db.dispute.findFirst({
      where: { milestoneId: parsed.data.milestoneId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
      select: { id: true },
    });
    if (openDispute && parsed.data.type === "RELEASE") {
      return fail("Cannot release funds while a dispute is open on this milestone.", 409);
    }
  }

  // For RELEASE records, the project owner is initiating the release of an
  // already-approved milestone. Set milestone to RELEASE_INITIATED BEFORE
  // creating any funding records. Use an ATOMIC conditional update to prevent
  // the concurrent-RELEASE race condition (double-spend payouts).
  // The conditional update (WHERE status = 'APPROVED') ensures only ONE
  // request can claim the milestone — concurrent requests get count=0.
  if (parsed.data.type === "RELEASE" && parsed.data.milestoneId) {
    const claimed = await db.milestone.updateMany({
      where: { id: parsed.data.milestoneId, status: "APPROVED" },
      data: { status: "RELEASE_INITIATED" },
    });
    if (claimed.count === 0) {
      // Milestone was not APPROVED (already being released by another request,
      // or status changed). Check if it's already RELEASE_INITIATED (idempotent retry).
      const currentMilestone = await db.milestone.findUnique({
        where: { id: parsed.data.milestoneId },
        select: { status: true },
      });
      if (currentMilestone?.status === "RELEASE_INITIATED" || currentMilestone?.status === "RELEASED") {
        return fail("Milestone is already being released or has been released.", 409);
      }
      return fail(`Milestone must be APPROVED to release (current: ${currentMilestone?.status})`, 400);
    }
  }

  // Create the funding record (idempotent). For RELEASE, use a milestone-scoped
  // idempotency key so concurrent/retried requests collapse to the same record.
  const idempotencyKey = parsed.data.idempotencyKey ??
    (parsed.data.type === "RELEASE" && parsed.data.milestoneId
      ? `release-milestone-${parsed.data.milestoneId}`
      : undefined);

  const result = await createFundingRecord({
    projectId: params.id,
    milestoneId: parsed.data.milestoneId ?? null,
    type: parsed.data.type,
    amountMinor: parsed.data.amountMinor,
    currency: project.currency,
    initiatedById: userId,
    idempotencyKey,
  });

  // For RELEASE records, call confirmFundingRecord synchronously to trigger payouts.
  if (parsed.data.type === "RELEASE") {
    try {
      await confirmFundingRecord({
        provider: "internal", // release is platform-internal; no external provider
        providerEventId: `release_${result.fundingRecordId}_${Date.now()}`,
        providerTxRef: result.providerTxRef,
        eventType: "release.confirmed",
        amountMinor: parsed.data.amountMinor,
        currency: project.currency,
        status: "PROVIDER_CONFIRMED",
        rawPayload: JSON.stringify({
          type: "RELEASE",
          fundingRecordId: result.fundingRecordId,
          initiatedBy: userId,
        }),
        signatureValid: true,
      });
    } catch (err) {
      // Log the failure — the release is recorded but payout failed.
      logSecurityEvent("error", "funding.release_confirm_failed", {
        fundingRecordId: result.fundingRecordId,
        message: (err as Error)?.message,
      });
    }
  }

  // Set milestone to AWAITING_FUNDING if a FUNDING record was initiated
  if (parsed.data.type === "FUNDING" && parsed.data.milestoneId && milestone?.status === "DRAFT") {
    await db.milestone.update({
      where: { id: parsed.data.milestoneId },
      data: { status: "AWAITING_FUNDING" },
    });
  }

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "funding.initiated",
    targetType: "FundingRecord",
    targetId: result.fundingRecordId,
    metadata: { type: parsed.data.type },
  });

  return {
    ...result,
    message:
      parsed.data.type === "FUNDING"
        ? "Funding initiated. Transfer to the project's virtual account to complete payment."
        : parsed.data.type === "RELEASE"
        ? "Release initiated. Funds will be paid out to the worker's bank account."
        : "Refund request initiated.",
  };
});
