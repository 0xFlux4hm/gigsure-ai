/**
 * Revoke an invitation (DELETE) + Resend an invitation (POST).
 *
 * Revoke: marks a PENDING invitation as REVOKED + records who revoked it.
 * Resend: generates a new token for an existing PENDING invitation (so the
 *   old token becomes invalid) + sends a fresh email + updates lastResentAt
 *   and resendCount. Rate-limited to prevent email-bombing.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { normalizeEmail } from "@/lib/security/validation";
import { notifyUser } from "@/lib/notifications";

// ── REVOKE ──
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
  if (inv.status === "REVOKED") return fail("Invitation already revoked", 400);

  // Atomic conditional update — prevents concurrent revocation races
  const result = await db.invitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: { status: "REVOKED", revokedById: userId },
  });
  if (result.count === 0) {
    return fail("Invitation could not be revoked (it may have been accepted or expired).", 409);
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "invitation.revoked",
    targetType: "Invitation",
    targetId: invitationId,
  });

  // Notify the inviter that their invitation was revoked
  await notifyUser({
    userId: inv.inviterId,
    projectId,
    type: "INVITATION_REVOKED",
    title: "Invitation revoked",
    body: `Invitation to ${inv.inviteeEmail ?? "a team member"} has been revoked.`,
  }).catch(() => {});

  return { revoked: true };
});

// ── RESEND ──
// POST /api/projects/[id]/invitations/[invitationId]/resend
// (handled here because the route is /invitations/[invitationId]/... and
//  Next.js routes by path segment — but "resend" isn't a separate segment
//  in this file's path. So we handle it as a POST on the [invitationId]
//  route itself with a ?action=resend query param, or via a separate
//  resend/route.ts file. For clarity, we use a separate file — see
//  resend/route.ts. This DELETE handler stays here.)
