/**
 * Public invitation lookup by raw token (no auth required to LOOK at it).
 * Acceptance requires authentication and uses an atomic transaction so concurrent
 * acceptance attempts cannot both succeed.
 *
 * Security enhancements:
 * - The accepting user's email must match the invitation email (when inviteeEmail is set)
 * - Or the user must be the bound invitee (when inviteeId is set)
 * - This prevents accepting invitations with unrelated accounts
 * - Uses notifyUser helper for consistent notification delivery
 * - Notifies the inviter when their invitation is accepted/rejected
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { hashToken } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { notifyUser, notifyProjectMembers } from "@/lib/notifications";
import { normalizeEmail } from "@/lib/security/validation";
import { z } from "zod";

export const GET = apiRoute(async (req, { params }) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? params.token;
  if (!token || token.length < 16) return fail("Invalid token", 400);
  const tokenHash = hashToken(token);
  const inv = await db.invitation.findUnique({
    where: { tokenHash },
    include: {
      project: {
        select: {
          id: true,
          title: true,
          description: true,
          owner: { select: { id: true, displayName: true } },
        },
      },
      inviter: { select: { id: true, displayName: true, email: true } },
    },
  });
  if (!inv) return fail("Invitation not found", 404);
  if (inv.status !== "PENDING") return fail(`Invitation already ${inv.status.toLowerCase()}`, 400);
  if (inv.expiresAt < new Date()) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    // Notify inviter that their invitation expired
    await notifyUser({
      userId: inv.inviterId,
      projectId: inv.projectId,
      type: "INVITATION_EXPIRED",
      title: "Invitation expired",
      body: `Your invitation to ${inv.inviteeEmail ?? "a team member"} for "${inv.project.title}" has expired.`,
    }).catch(() => {});
    return fail("Invitation has expired", 400);
  }
  return {
    invitationId: inv.id,
    projectId: inv.project.id,
    projectTitle: inv.project.title,
    projectDescription: inv.project.description,
    ownerName: inv.project.owner.displayName,
    inviterName: inv.inviter.displayName,
    inviterEmail: inv.inviter.email,
    role: inv.role,
    expiresAt: inv.expiresAt,
    personalMessage: inv.personalMessage,
    createdAt: inv.createdAt,
    lastResentAt: inv.lastResentAt,
  };
});

const AcceptSchema = z.object({
  token: z.string().min(16).max(128),
  decision: z.enum(["ACCEPT", "REJECT"]),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const tokenHash = hashToken(parsed.data.token);
  // Concurrent-safe accept: use a transaction with conditional update.
  const result = await db.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({
      where: { tokenHash },
      include: { project: { select: { title: true } } },
    });
    if (!inv) return { error: "Invitation not found", status: 404 };
    if (inv.status !== "PENDING") return { error: `Invitation already ${inv.status.toLowerCase()}`, status: 400 };
    if (inv.expiresAt < new Date()) {
      await tx.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
      return { error: "Invitation has expired", status: 400 };
    }

    // ── EMAIL VERIFICATION + BINDING CHECK ──
    // If inviteeId is bound, the current user must be that user.
    if (inv.inviteeId && inv.inviteeId !== userId) {
      logSecurityEvent("warn", "invitation.accept_wrong_user", {
        invitationId: inv.id,
        attemptedBy: userId,
        intendedFor: inv.inviteeId,
      });
      return { error: "This invitation was issued to a different user", status: 403 };
    }

    // If inviteeEmail is set but no inviteeId (unregistered invitee),
    // verify the accepting user's email matches the invitation email.
    // This prevents someone from accepting an invitation using an
    // unrelated account.
    if (!inv.inviteeId && inv.inviteeEmail) {
      const acceptor = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true, emailNormalized: true, emailVerifiedAt: true },
      });
      if (!acceptor) return { error: "Account not found", status: 404 };

      // Require verified email
      if (!acceptor.emailVerifiedAt) {
        return {
          error: "Please verify your email address before accepting this invitation.",
          status: 403,
        };
      }

      // Check email match
      const invitationEmailNormalized = normalizeEmail(inv.inviteeEmail);
      if (acceptor.emailNormalized !== invitationEmailNormalized) {
        logSecurityEvent("warn", "invitation.accept_email_mismatch", {
          invitationId: inv.id,
          attemptedBy: userId,
          attemptedEmail: acceptor.emailNormalized,
          invitationEmail: invitationEmailNormalized,
        });
        return {
          error: `This invitation was sent to ${inv.inviteeEmail}. Please sign in with that email address.`,
          status: 403,
        };
      }
    }

    if (parsed.data.decision === "REJECT") {
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "REJECTED", consumedAt: new Date() },
      });
      return {
        ok: true,
        decision: "REJECTED",
        inviterId: inv.inviterId,
        projectId: inv.projectId,
        projectTitle: inv.project.title,
        inviteeEmail: inv.inviteeEmail,
      };
    }

    // Accept: ensure not already a member
    const existing = await tx.projectMembership.findUnique({
      where: { projectId_userId: { projectId: inv.projectId, userId } },
    });
    if (existing && !existing.revokedAt) {
      // Already a member — consume invitation but don't add duplicate membership.
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED", consumedAt: new Date() },
      });
      return {
        ok: true,
        decision: "ACCEPTED",
        alreadyMember: true,
        projectId: inv.projectId,
        inviterId: inv.inviterId,
        projectTitle: inv.project.title,
        role: inv.role,
        inviteeEmail: inv.inviteeEmail,
      };
    }

    // Atomic membership creation + invitation consumption.
    await tx.projectMembership.create({
      data: {
        projectId: inv.projectId,
        userId,
        role: inv.role,
      },
    });
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", consumedAt: new Date() },
    });
    return {
      ok: true,
      decision: "ACCEPTED",
      projectId: inv.projectId,
      inviterId: inv.inviterId,
      projectTitle: inv.project.title,
      role: inv.role,
      inviteeEmail: inv.inviteeEmail,
    };
  });

  if ("error" in result && result.error) {
    return fail(result.error, result.status ?? 400);
  }

  // ── POST-TRANSACTION NOTIFICATIONS ──
  // Notify the user who accepted/rejected
  if (result.decision === "ACCEPTED") {
    const role = result.role ?? "member";
    const projectTitle = result.projectTitle ?? "the project";
    await notifyUser({
      userId,
      projectId: result.projectId,
      type: "INVITATION_ACCEPTED",
      title: `You joined "${projectTitle}"`,
      body: `You are now a ${role.toLowerCase()} on this project.`,
    }).catch(() => {});

    // Notify the inviter that their invitation was accepted
    const inviterIdAccept = result.inviterId ?? "";
    if (inviterIdAccept) {
      await notifyUser({
        userId: inviterIdAccept,
        projectId: result.projectId,
        type: "INVITATION_ACCEPTED",
        title: "Invitation accepted",
        body: `${result.inviteeEmail ?? "A team member"} accepted your invitation to join "${projectTitle}".`,
      }).catch(() => {});
    }

    // Notify existing project members that a new member joined
    await notifyProjectMembers(
      result.projectId,
      userId, // exclude the new member
      {
        type: "INVITATION_ACCEPTED",
        title: "New team member",
        body: `${result.inviteeEmail ?? "A new member"} joined as ${role.toLowerCase()}.`,
      },
    ).catch(() => {});
  } else {
    // REJECT — notify the inviter
    const projectTitle = result.projectTitle ?? "the project";
    const projectId = result.projectId ?? undefined;
    const inviterId = result.inviterId ?? "";
    if (inviterId) {
      await notifyUser({
        userId: inviterId,
        projectId,
        type: "INVITATION_DECLINED",
        title: "Invitation declined",
        body: `${result.inviteeEmail ?? "A team member"} declined your invitation to join "${projectTitle}".`,
      }).catch(() => {});
    }
  }

  await recordAuditEvent({
    actorId: userId,
    projectId: result.projectId ?? undefined,
    action: `invitation.${String(parsed.data.decision).toLowerCase()}`,
    targetType: "Invitation",
    metadata: { decision: parsed.data.decision },
  });

  // Return only the client-safe fields (strip inviterId etc.)
  return {
    ok: result.ok,
    decision: result.decision,
    projectId: result.projectId,
    alreadyMember: "alreadyMember" in result ? result.alreadyMember : undefined,
  };
});
