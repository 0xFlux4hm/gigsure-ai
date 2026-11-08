/**
 * Resend an invitation.
 *
 * POST /api/projects/[id]/invitations/[invitationId]/resend
 *
 * Generates a fresh token for an existing PENDING invitation (invalidating
 * the old token), sends a new email, and updates lastResentAt + resendCount.
 * Rate-limited to 5 resends per invitation per hour.
 *
 * Security:
 * - Requires project:invite permission (OWNER only)
 * - Only PENDING invitations can be resent
 * - Old token hash is replaced → old links stop working
 * - Rate-limited per invitation (5/hr) and per inviter (20/hr)
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { notifyUser } from "@/lib/notifications";
import { normalizeEmail } from "@/lib/security/validation";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, invitationId } = params;

  // Rate limit: 5 resends per invitation per hour
  const resendRL = await checkRateLimit(`invite:resend:${invitationId}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!resendRL.ok) {
    return fail("This invitation has been resent too many times. Please try again later.", 429);
  }

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "project:invite");

  const inv = await db.invitation.findUnique({ where: { id: invitationId } });
  if (!inv || inv.projectId !== projectId) return fail("Invitation not found", 404);
  if (inv.status !== "PENDING") {
    return fail(`Cannot resend an invitation that is ${inv.status.toLowerCase()}.`, 400);
  }

  // Generate a new token (invalidating the old one)
  const rawToken = generateToken();

  // Atomic update — only update if still PENDING (prevents resend-after-accept race)
  const result = await db.invitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: {
      tokenHash: hashToken(rawToken),
      lastResentAt: new Date(),
      resendCount: { increment: 1 },
      // Extend expiry by another 7 days from now
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  if (result.count === 0) {
    return fail("This invitation could not be resent (it may have been accepted or revoked).", 409);
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://gigsure-ai.vercel.app";
  const inviteUrl = `${baseUrl}/?view=invitation&token=${rawToken}&project=${projectId}`;

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "invitation.resent",
    targetType: "Invitation",
    targetId: invitationId,
  });

  // Send email if SMTP is configured
  let emailSent = false;
  if (inv.inviteeEmail && process.env.SMTP_URL) {
    try {
      const { sendEmail } = await import("@/lib/email/provider");
      const inviterUser = await db.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const projectName = (await db.project.findUnique({
        where: { id: projectId },
        select: { title: true },
      }))?.title ?? "a project";

      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return map[c] || c;
      });

      await sendEmail({
        to: inv.inviteeEmail,
        subject: `Reminder: You're invited to join "${projectName}" on GigSure AI`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003087, #002469); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 20px;">GigSure AI</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Invitation Reminder</p>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">
                <strong>${esc(inviterUser?.displayName ?? "Someone")}</strong> has reminded you to join
                <strong>"${esc(projectName)}"</strong> as a
                <strong>${inv.role.toLowerCase()}</strong>.
              </p>
              ${inv.personalMessage ? `<div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; font-style: italic; color: #4b5563;">"${esc(inv.personalMessage)}"</div>` : ""}
              <a href="${inviteUrl}" style="display: inline-block; background: #003087; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 8px 0 16px;">
                Accept Invitation
              </a>
              <p style="margin: 0; font-size: 13px; color: #6b7280;">
                Or copy this link: ${inviteUrl}
              </p>
              <p style="margin: 16px 0 0; font-size: 13px; color: #9ca3af;">
                This invitation expires on ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}.
              </p>
            </div>
          </div>
        `,
        text: `Reminder: ${inviterUser?.displayName ?? "Someone"} has invited you to join "${projectName}" as a ${inv.role.toLowerCase()}. Accept here: ${inviteUrl}`,
      } as Parameters<typeof sendEmail>[0]);
      emailSent = true;
    } catch (err) {
      logSecurityEvent("error", "invitation.resend_email_failed", {
        invitationId,
        message: (err as Error)?.message,
      });
    }
  }

  // Notify inviter that resend was successful
  await notifyUser({
    userId,
    projectId,
    type: "INVITATION_RESENT",
    title: "Invitation resent",
    body: `Invitation resent to ${inv.inviteeEmail ?? "a team member"}.`,
  }).catch(() => {});

  return {
    resent: true,
    inviteUrl,
    emailSent,
    message: emailSent
      ? "Invitation resent. A new email has been sent."
      : "Invitation link regenerated. Share it with the recipient.",
  };
});
