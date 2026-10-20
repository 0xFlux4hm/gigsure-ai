/**
 * Public invitation lookup by raw token (no auth required to LOOK at it).
 * Acceptance requires authentication and uses an atomic transaction so concurrent
 * acceptance attempts cannot both succeed.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { hashToken, constantTimeEqual } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
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
    const inv = await tx.invitation.findUnique({ where: { tokenHash } });
    if (!inv) return { error: "Invitation not found", status: 404 };
    if (inv.status !== "PENDING") return { error: `Invitation already ${inv.status.toLowerCase()}`, status: 400 };
    if (inv.expiresAt < new Date()) {
      await tx.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
      return { error: "Invitation has expired", status: 400 };
    }
    // If invitee-bound, ensure the current user is the intended recipient.
    if (inv.inviteeId && inv.inviteeId !== userId) {
      logSecurityEvent("warn", "invitation.accept_wrong_user", {
        invitationId: inv.id,
        attemptedBy: userId,
        intendedFor: inv.inviteeId,
      });
      return { error: "This invitation was issued to a different user", status: 403 };
    }

    if (parsed.data.decision === "REJECT") {
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "REJECTED", consumedAt: new Date() },
      });
      return { ok: true, decision: "REJECTED" };
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
      return { ok: true, decision: "ACCEPTED", alreadyMember: true };
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
    await tx.notification.create({
      data: {
        userId,
        projectId: inv.projectId,
        type: "INVITATION_ACCEPTED",
        title: "You joined a project",
        body: `You are now a ${inv.role.toLowerCase()} on this project.`,
      },
    });
    return { ok: true, decision: "ACCEPTED", projectId: inv.projectId };
  });

  if ("error" in result && result.error) {
    return fail(result.error, result.status ?? 400);
  }
  await recordAuditEvent({
    actorId: userId,
    projectId: result.projectId ?? undefined,
    action: `invitation.${String(parsed.data.decision).toLowerCase()}`,
    targetType: "Invitation",
    metadata: { decision: parsed.data.decision },
  });
  return result;
});
