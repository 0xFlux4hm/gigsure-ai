/**
 * List & initiate funding records.
 *
 * Types:
 *   - FUNDING: client funds milestone (simulated mock provider).
 *   - RELEASE: milestone approved → owner can release funds to collaborator.
 *   - REFUND: client can request refund (only on FUNDING records that are PROVIDER_CONFIRMED).
 *
 * Idempotency: each request returns the same record for the same idempotencyKey.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { initiateFunding } from "@/lib/payments/mock-provider";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
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

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid funding request", 422); }

  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { id: true, currency: true },
  });
  if (!project) return fail("Project not found", 404);

  // If milestone-bound, validate milestone belongs to project + check status.
  let milestone: { id: string; status: string; amountMinor: number } | null = null;
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
    if (parsed.data.type === "RELEASE" && milestone.status !== "APPROVED") {
      return fail(`Milestone must be APPROVED to release (current: ${milestone.status})`, 400);
    }
    // SECURITY (2026-10): REFUND requires an existing PROVIDER_CONFIRMED
    // FUNDING record (header comment says so but it wasn't enforced).
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

  const result = await initiateFunding({
    projectId: params.id,
    milestoneId: parsed.data.milestoneId ?? null,
    type: parsed.data.type,
    amountMinor: parsed.data.amountMinor,
    currency: project.currency,
    initiatedById: userId,
    idempotencyKey: parsed.data.idempotencyKey,
  });

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
    metadata: { type: parsed.data.type, simulated: true },
  });

  return {
    ...result,
    simulated: true,
    message: "SIMULATED funding initiated. No real money was moved.",
  };
});
