/**
 * Submit a milestone for approval.
 *
 * Allowed transitions:
 *   FUNDED → SUBMITTED
 *   SUBMITTED → APPROVED | CHANGES_REQUESTED (via /approve)
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, milestoneId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  // Owner, team lead, or collaborator may submit; client approves.

  const milestone = await db.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) {
    return fail("Milestone not found", 404);
  }
  if (milestone.status !== "FUNDED") {
    return fail(`Milestone must be FUNDED to submit (current: ${milestone.status})`, 400);
  }

  await db.milestone.update({
    where: { id: milestoneId },
    data: { status: "SUBMITTED" },
  });
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "milestone.submitted",
    targetType: "Milestone",
    targetId: milestoneId,
  });
  return { submitted: true };
});
