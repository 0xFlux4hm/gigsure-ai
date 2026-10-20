/**
 * Reviewer-only endpoint: assign reviewer + record proposed resolution.
 *
 * AI can summarize evidence but CANNOT make binding decisions. The outcome
 * is recorded as advisory metadata; only the platform admin (or future legal
 * workflow) can finalize.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
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
