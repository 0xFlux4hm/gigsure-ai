/**
 * Reviewer-only endpoint: assign reviewer + record proposed resolution.
 *
 * AI can summarize evidence but CANNOT make binding decisions. The outcome
 * is recorded as advisory metadata; only the platform admin (or future legal
 * workflow) can finalize.
 *
 * Fixed IDOR — handler previously didn't verify
 * `disputeId` belongs to `projectId` in the URL, didn't check `dispute:review`
 * permission, and didn't verify a REVIEWER is assigned to the dispute.
 * Attackers could post reviews to any project's dispute by guessing the cuid.
 *
 * Also refuses to mutate disputes that are already RESOLVED/CLOSED.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  note: z.string().max(4000).optional(),
  proposedResolution: z.string().max(8000).optional(),
  outcome: z.enum(["UPHOLD_CLAIM", "REJECT_CLAIM", "PARTIAL", "ESCALATE"]).optional(),
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, disputeId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "dispute:review");

  // verify dispute belongs to the project in the URL.
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, projectId: true, status: true },
  });
  if (!dispute || dispute.projectId !== projectId) {
    return fail("Dispute not found in this project", 404);
  }
  // REVIEWER role must be assigned to this specific dispute.
  if (membership.role === "REVIEWER") {
    const assigned = await db.disputeReview.findUnique({
      where: { disputeId_reviewerId: { disputeId, reviewerId: userId } },
      select: { id: true },
    });
    if (!assigned) {
      throw new AuthzError("Dispute not assigned to you", 403);
    }
  }
  // refuse to mutate a closed dispute.
  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    return fail(`Cannot review a ${dispute.status} dispute`, 400);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid review", 422);

  // Auto-assign reviewer if not already.
  const review = await db.disputeReview.upsert({
    where: { disputeId_reviewerId: { disputeId, reviewerId: userId } },
    create: {
      disputeId,
      reviewerId: userId,
      note: parsed.data.note ?? null,
      proposedResolution: parsed.data.proposedResolution ?? null,
      outcome: parsed.data.outcome ?? null,
    },
    update: {
      note: parsed.data.note ?? null,
      proposedResolution: parsed.data.proposedResolution ?? null,
      outcome: parsed.data.outcome ?? null,
      decidedAt: parsed.data.outcome ? new Date() : null,
    },
  });

  // If outcome is ESCALATE, mark dispute as ESCALATED.
  if (parsed.data.outcome === "ESCALATE") {
    await db.dispute.update({ where: { id: disputeId }, data: { status: "ESCALATED" } });
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "dispute.reviewed",
    targetType: "Dispute",
    targetId: disputeId,
    metadata: { outcome: parsed.data.outcome },
  });
  return review;
});
