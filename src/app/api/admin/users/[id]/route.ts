/**
 * Admin: modify or delete a single user.
 *
 * Actions (PATCH):
 *   - { action: "suspend" } -> accountStatus = SUSPENDED
 *   - { action: "activate" } -> accountStatus = ACTIVE
 *   - { action: "promote_admin" } -> platformRole = ADMIN
 *   - { action: "demote_admin" } -> platformRole = USER
 *
 * DELETE:
 *   Soft-deletes the user — anonymizes PII (email, displayName, passwordHash),
 *   revokes all sessions/identities/tokens, and sets accountStatus = DELETED.
 *   Financial/audit records are RETAINED for legal/accounting reasons.
 *   This matches the existing privacy deletion flow (src/app/api/privacy/delete/route.ts).
 *
 * All actions are audited. Self-deletion and self-demotion are blocked.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(["suspend", "activate", "promote_admin", "demote_admin"]),
  reason: z.string().max(500).optional(),
});

export const PATCH = apiRoute(async (req, { params }) => {
  const admin = await requireAdmin();
  const targetId = params.id;

  // Look up the target user
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, displayName: true, accountStatus: true, platformRole: true },
  });
  if (!target) return fail("User not found", 404);

  const body = await parseJsonBody<unknown>(req);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid action", 422); }

  const data = parsed.data;

  // Prevent self-demotion / self-suspension
  if (admin.userId === target.id && (data.action === "demote_admin" || data.action === "suspend")) {
    return fail("You cannot perform this action on your own account.", 400);
  }

  // SECURITY: Prevent demoting/suspending the second-to-last admin
  // (would leave only 1 admin — single point of failure)
  if ((data.action === "demote_admin" || data.action === "suspend") && target.platformRole === "ADMIN") {
    const activeAdminCount = await db.user.count({
      where: { platformRole: "ADMIN", accountStatus: "ACTIVE" },
    });
    if (activeAdminCount <= 2) {
      return fail("Cannot demote or suspend — would leave fewer than 2 active admins.", 400);
    }
  }

  let update: Record<string, unknown> = {};
  let auditAction: string = "";
  switch (data.action) {
    case "suspend":
      update = { accountStatus: "SUSPENDED" };
      auditAction = "admin.user_suspended";
      break;
    case "activate":
      update = { accountStatus: "ACTIVE" };
      auditAction = "admin.user_activated";
      break;
    case "promote_admin":
      update = { platformRole: "ADMIN" };
      auditAction = "admin.user_promoted";
      break;
    case "demote_admin":
      update = { platformRole: "USER" };
      auditAction = "admin.user_demoted";
      break;
  }

  await db.user.update({
    where: { id: target.id },
    data: update,
  });

  logSecurityEvent("warn", auditAction, {
    adminId: admin.userId,
    targetId: target.id,
    targetEmail: target.email,
    reason: data.reason,
  });

  await recordAuditEvent({
    actorId: admin.userId,
    action: auditAction,
    targetType: "User",
    targetId: target.id,
    metadata: {
      targetEmail: target.email,
      reason: data.reason,
      before: {
        accountStatus: target.accountStatus,
        platformRole: target.platformRole,
      },
      after: update,
    },
  });

  // Notify the target user (except when promoting to admin — that's a silent grant)
  if (data.action === "suspend" || data.action === "activate") {
    await db.notification.create({
      data: {
        userId: target.id,
        type: "SECURITY",
        title: data.action === "suspend" ? "Account suspended" : "Account reactivated",
        body:
          data.action === "suspend"
            ? `Your account has been suspended by an administrator. Reason: ${data.reason ?? "not specified"}. Contact support if you believe this is an error.`
            : "Your account has been reactivated. You can sign in again.",
      },
    });
  }

  return {
    ok: true,
    target: { id: target.id, email: target.email, displayName: target.displayName },
    action: data.action,
    changes: update,
  };
});

// ---------------------------------------------------------------------------
// DELETE — soft-delete user (anonymize PII + revoke access)
// ---------------------------------------------------------------------------

export const DELETE = apiRoute(async (req, { params }) => {
  const admin = await requireAdmin();
  const targetId = params.id;

  // Parse optional reason from query string
  const url = new URL(req.url);
  const reason = url.searchParams.get("reason") ?? "Deleted by administrator";

  // Look up the target user
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      displayName: true,
      accountStatus: true,
      platformRole: true,
    },
  });
  if (!target) return fail("User not found", 404);

  // Prevent self-deletion
  if (admin.userId === target.id) {
    return fail("You cannot delete your own account.", 400);
  }

  // Prevent deleting another admin (must demote first)
  if (target.platformRole === "ADMIN") {
    return fail("Cannot delete an admin user. Demote them to USER first.", 400);
  }

  // Prevent deleting if user owns active projects
  const activeProjects = await db.project.count({
    where: { ownerId: target.id, status: { notIn: ["CANCELLED"] } },
  });
  if (activeProjects > 0) {
    return fail(
      `Cannot delete user — they own ${activeProjects} active project(s). Cancel or transfer ownership first.`,
      400,
    );
  }

  // Check admin count (don't delete if this would leave < 2 admins —
  // though we already block ADMIN deletion above, this is defense-in-depth)
  const activeAdminCount = await db.user.count({
    where: { platformRole: "ADMIN", accountStatus: "ACTIVE" },
  });
  if (target.platformRole === "ADMIN" && activeAdminCount <= 2) {
    return fail("Cannot delete — would leave fewer than 2 active admins.", 400);
  }

  // Soft-delete: anonymize PII + revoke access + mark as DELETED
  // This matches the existing privacy deletion flow (src/app/api/privacy/delete/route.ts)
  // Financial/audit records are RETAINED for legal/accounting reasons.
  const now = new Date();
  const anonymizedEmail = `deleted+${target.id.slice(-8)}@gigsure.invalid`;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        email: anonymizedEmail,
        emailNormalized: anonymizedEmail,
        displayName: "Deleted User",
        passwordHash: null,
        accountStatus: "DELETED",
        deletedAt: now,
      },
    });

    // Revoke all identities (Google OAuth links, etc.)
    await tx.userIdentity.deleteMany({ where: { userId: target.id } });

    // Revoke all linked accounts
    await tx.linkedAccount.deleteMany({ where: { userId: target.id } });

    // Invalidate all sessions
    await tx.revokedSession.create({
      data: {
        jti: `admin-delete-${target.id}-${now.getTime()}`,
        userId: target.id,
        reason: "admin.user_deleted",
        userAgent: "admin",
        ipAddress: "admin",
      },
    }).catch(() => {}); // ignore if JTI already exists

    // Revoke all email verification tokens
    await tx.emailVerificationToken.deleteMany({ where: { userId: target.id } });

    // Revoke all password reset tokens
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id } });

    // Anonymize user profile
    await tx.userProfile.updateMany({
      where: { userId: target.id },
      data: { headline: null, bio: null, skills: "[]", portfolioLinks: "[]", preferredCategories: "[]" },
    }).catch(() => {});

    // Revoke all project memberships (soft-delete)
    await tx.projectMembership.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  logSecurityEvent("warn", "admin.user_deleted", {
    adminId: admin.userId,
    targetId: target.id,
    targetEmail: target.email,
    reason,
  });

  await recordAuditEvent({
    actorId: admin.userId,
    action: "admin.user_deleted",
    targetType: "User",
    targetId: target.id,
    metadata: {
      targetEmail: target.email,
      reason,
      before: {
        accountStatus: target.accountStatus,
        platformRole: target.platformRole,
      },
    },
  });

  return {
    ok: true,
    deleted: true,
    target: { id: target.id, email: target.email, displayName: target.displayName },
    reason,
  };
});
