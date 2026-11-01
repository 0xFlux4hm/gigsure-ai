/**
 * List & create invitations.
 *
 * Invitation tokens are cryptographically random (32 bytes), stored as SHA-256
 * hashes. Each invitation is bound to a specific project and role, optionally
 * to a specific recipient, and has a hard expiry.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId, getClientIp } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
const Schema = z.object({
  inviteeEmail: z.string().email().optional(),
  inviteeId: z.string().cuid().optional(),
  role: z.enum(["COLLABORATOR", "TEAM_LEAD", "REVIEWER"]),
  expiresInSeconds: z.number().min(3600).max(604800).default(604800), // 1h..7d
}).refine((d) => d.inviteeEmail || d.inviteeId, {
  message: "Either inviteeEmail or inviteeId is required",
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  const invitations = await db.invitation.findMany({
    where: { projectId: params.id },
    include: {
      invitee: { select: { id: true, displayName: true, email: true } },
      inviter: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return { invitations };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  // rate-limit invitations to prevent email-bombing
  // victims via the platform's SMTP account.
  const inviterRL = await checkRateLimit(`invite:user:${userId}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!inviterRL.ok) {
    return fail("Too many invitations sent. Please try again later.", 429);
  }
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "project:invite");

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid invitation", 422); }

  const data = parsed.data;
  // also rate-limit per invitee email to prevent one
  // attacker from email-bombing a specific victim.
  if (data.inviteeEmail) {
    const inviteeEmail = normalizeEmail(data.inviteeEmail);
    const inviteeRL = await checkRateLimit(`invite:email:${inviteeEmail}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!inviteeRL.ok) {
      return fail("This email has been invited too many times. Please try again later.", 429);
    }
  }
  let inviteeId: string | null = null;
  let inviteeEmail: string | null = null;
  if (data.inviteeId) {
    const u = await db.user.findUnique({ where: { id: data.inviteeId } });
    if (!u) return fail("Invitee not found", 404);
    inviteeId = u.id;
    inviteeEmail = u.email;
  } else if (data.inviteeEmail) {
    inviteeEmail = normalizeEmail(data.inviteeEmail);
    if (!validateEmail(inviteeEmail)) return fail("Invalid email", 400);
    const u = await db.user.findUnique({ where: { emailNormalized: inviteeEmail } });
    if (u) inviteeId = u.id;
  }

  const rawToken = generateToken();
  const invitation = await db.invitation.create({
    data: {
      projectId: params.id,
      inviteeId,
      inviteeEmail,
      inviterId: userId,
      role: data.role,
      tokenHash: hashToken(rawToken),
      status: "PENDING",
      expiresAt: new Date(Date.now() + data.expiresInSeconds * 1000),
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "invitation.created",
    targetType: "Invitation",
    targetId: invitation.id,
    metadata: { role: data.role, inviteeEmail },
  });

  // Always generate the invite URL — in production it's also emailed,
  // but we return it so the frontend can display it for copying.
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://gigsure-ai.vercel.app";
  const inviteUrl = `${baseUrl}/?view=invitation&token=${rawToken}&project=${params.id}`;

  // Send invitation email if SMTP is configured
  if (inviteeEmail && process.env.SMTP_URL) {
    try {
      const { sendEmail } = await import("@/lib/email/provider");
      await sendEmail({
        to: inviteeEmail,
        subject: `You're invited to join "${inv.project.title}" on GigSure AI`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003087, #002469); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 20px;">GigSure AI</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Project Invitation</p>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">
                <strong>${inviter.displayName}</strong> has invited you to join
                <strong>"${inv.project.title}"</strong> as a
                <strong>${data.role.toLowerCase()}</strong>.
              </p>
              <a href="${inviteUrl}" style="display: inline-block; background: #003087; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 8px 0 16px;">
                Accept Invitation
              </a>
              <p style="margin: 0; font-size: 13px; color: #6b7280;">
                Or copy this link: ${inviteUrl}
              </p>
              <p style="margin: 16px 0 0; font-size: 13px; color: #9ca3af;">
                This invitation expires on ${new Date(Date.now() + data.expiresInSeconds * 1000).toLocaleDateString()}.
              </p>
            </div>
          </div>
        `,
        text: `${inviter.displayName} has invited you to join "${inv.project.title}" as a ${data.role.toLowerCase()}. Accept here: ${inviteUrl}`,
      });
    } catch (err) {
      // Don't fail the invitation if email fails — the URL is still returned
      logSecurityEvent("error", "invitation.email_failed", {
        invitationId: invitation.id,
        message: (err as Error)?.message,
      });
    }
  }

  return {
    invitationId: invitation.id,
    inviteUrl,
    emailSent: !!inviteeEmail && !!process.env.SMTP_URL,
    message: inviteeEmail && process.env.SMTP_URL
      ? "Invitation sent. Check your email."
      : "Invitation created. Share the invite link with the recipient.",
  };
});
