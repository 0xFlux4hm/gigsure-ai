/** Revoke an invitation. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, invitationId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "project:invite");

  const inv = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.projectId !== projectId) return fail("Invitation not found", 404);
  if (inv.status === "ACCEPTED") return fail("Invitation already accepted", 400);

  await db.invitation.update({
    where: { id: invitationId },
    data: { status: "REVOKED" },
  });
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "invitation.revoked",
    targetType: "Invitation",
    targetId: invitationId,
  });
  return { revoked: true };
});
