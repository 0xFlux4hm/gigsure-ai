/**
 * List & create invitations.
 *
 * Invitation tokens are cryptographically random (32 bytes), stored as SHA-256
 * hashes. Each invitation is bound to a specific project and role, optionally
 * to a specific recipient, and has a hard expiry.
 *
 * Enhancements:
 * - Duplicate active invitation prevention (same project + email + PENDING)
 * - Optional personal message from inviter to invitee
 * - Notifications for all invitation events via notifyUser helper
 * - Resend tracking (lastResentAt, resendCount)
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { notifyUser } from "@/lib/notifications";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
import { z } from "zod";

const Schema = z.object({
  inviteeEmail: z.string().email().optional(),
  inviteeId: z.string().cuid().optional(),
  role: z.enum(["COLLABORATOR", "TEAM_LEAD", "REVIEWER"]),
  expiresInSeconds: z.number().min(3600).max(604800).default(604800), // 1h..7d
  personalMessage: z.string().max(500).optional(), // optional personal note
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
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    return fail("Invalid invitation", 422);
  }

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

  // ── DUPLICATE ACTIVE INVITATION PREVENTION ──
  // Check if there's already a PENDING invitation for the same project +
  // email/user. This prevents sending duplicate invitations to the same
  // person for the same project.
  const existingInvitation = inviteeEmail
    ? await db.invitation.findFirst({
        where: {
          projectId: params.id,
          inviteeEmail,
          status: "PENDING",
          expiresAt: { gt: new Date() }, // not expired
        },
      })
    : inviteeId
      ? await db.invitation.findFirst({
          where: {
            projectId: params.id,
            inviteeId,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        })
      : null;

  if (existingInvitation) {
    return fail(
      "An active invitation already exists for this email on this project. Revoke it first or wait for it to expire.",
      409,
    );
  }

  // ── CREATE INVITATION ──
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
      personalMessage: data.personalMessage?.trim() || null,
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

  // ── SEND EMAIL (if SMTP configured) ──
  let emailSent = false;
  if (inviteeEmail && process.env.SMTP_URL) {
    try {
      const { sendEmail } = await import("@/lib/email/provider");
      const inviterUser = await db.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      const projectName = (await db.project.findUnique({
        where: { id: params.id },
        select: { title: true },
      }))?.title ?? "a project";

      // Escape user-controlled values to prevent HTML injection in email clients
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
        return map[c] || c;
      });
      const inviterName = esc(inviterUser?.displayName ?? "Someone");
      const project = esc(projectName);
      const role = esc(data.role.toLowerCase());
      const messageHtml = data.personalMessage
        ? `<div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; font-style: italic; color: #4b5563;">"${esc(data.personalMessage.trim())}"</div>`
        : "";

      await sendEmail({
        to: inviteeEmail,
        subject: `You're invited to join "${projectName}" on GigSure AI`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #003087, #002469); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 20px;">GigSure AI</h1>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Project Invitation</p>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">
                <strong>${inviterName}</strong> has invited you to join
                <strong>"${project}"</strong> as a
                <strong>${role}</strong>.
              </p>
              ${messageHtml}
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
        text: `${inviterUser?.displayName ?? "Someone"} has invited you to join "${projectName}" as a ${data.role.toLowerCase()}.${data.personalMessage ? ` Message: ${data.personalMessage}` : ""} Accept here: ${inviteUrl}`,
      } as Parameters<typeof sendEmail>[0]);
      emailSent = true;
    } catch (err) {
      logSecurityEvent("error", "invitation.email_failed", {
        invitationId: invitation.id,
        message: (err as Error)?.message,
      });
    }
  }

  // ── NOTIFY INVITER (confirmation) ──
  // Notify the inviter that the invitation was created (so they see it in
  // their inbox as a record of what they sent).
  await notifyUser({
    userId,
    projectId: params.id,
    type: "INVITATION_SENT",
    title: "Invitation sent",
    body: `Invitation sent to ${inviteeEmail ?? "a team member"} as ${data.role}.`,
  }).catch(() => {});

  return {
    invitationId: invitation.id,
    inviteUrl,
    emailSent,
    message: emailSent
      ? "Invitation sent. Check your email."
      : "Invitation created. Share the invite link with the recipient.",
  };
});
