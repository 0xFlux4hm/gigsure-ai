/** Post a message to a dispute thread. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({ body: z.string().min(1).max(8000) });

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, disputeId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute || dispute.projectId !== projectId) return fail("Dispute not found", 404);

  // REVIEWER role can only post to disputes assigned to them.
  // The sibling GET handler already had this check, but POST didn't.
  if (membership.role === "REVIEWER") {
    const assigned = await db.disputeReview.findFirst({
      where: { disputeId, reviewerId: userId },
      select: { id: true },
    });
    if (!assigned) throw new AuthzError("Dispute not assigned to you", 403);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid message", 422);

  const msg = await db.disputeMessage.create({
    data: { disputeId, authorId: userId, body: parsed.data.body },
  });
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "dispute.message",
    targetType: "Dispute",
    targetId: disputeId,
  });
  return msg;
});
