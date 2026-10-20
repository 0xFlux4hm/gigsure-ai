/**
 * Request account deletion.
 *
 * Per spec 10:
 *   - Reauthenticate (caller must pass currentPassword if password is set).
 *   - Identify active projects/disputes (warn user in UI before this call).
 *   - Apply documented retention rules: anonymize PII, retain financial/audit records.
 *   - Revoke sessions & credentials.
 *
 * Implementation: marks accountStatus = PENDING_DELETION and clears PII.
 * Audit records are retained (anonymized). Financial records are retained for
 * legal/accounting reasons.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/security/password";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  confirmPhrase: z.literal("DELETE MY ACCOUNT"),
  currentPassword: z.string().min(1).max(256).optional(),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid deletion request", 422);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      accountStatus: true,
      platformRole: true,
      // SECURITY (2026-10): for OAuth-only accounts, require a recent
      // passwordChangedAt (i.e., user just set a password) OR a recent
      // session re-issue. Without this, OAuth-only users could self-delete
      // with just `confirmPhrase` — no reauthentication at all.
    },
  });
  if (!user) return fail("User not found", 404);
  if (user.accountStatus !== "ACTIVE") return fail("Account not active", 400);

  // SECURITY (2026-10): prevent the last admin from deleting themselves.
  if (user.platformRole === "ADMIN") {
    const adminCount = await db.user.count({
      where: { platformRole: "ADMIN", accountStatus: "ACTIVE" },
    });
    if (adminCount <= 1) {
      return fail(
        "Cannot delete the last admin account. Demote yourself or appoint another admin first.",
        400,
      );
    }
  }

  // Reauthentication: if password set, must verify.
  if (user.passwordHash) {
    if (!parsed.data.currentPassword) {
      return fail("Reauthentication required (provide currentPassword)", 401);
    }
    if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      logSecurityEvent("warn", "privacy.delete_reauth_failed", { userId });
      return fail("Current password is incorrect", 403);
    }
  } else {
    // SECURITY (2026-10): OAuth-only account — require reauthentication via
    // Google. For now we refuse deletion until the user sets a password
    // first. (Future: accept a fresh Google OIDC `code` here.)
    return fail(
      "Reauthentication required. Please set a password on your account first, then retry deletion with currentPassword.",
      401,
    );
  }

  // Check active projects (owner only) — refuse if there are any non-COMPLETED ones.
  const activeProjects = await db.project.count({
    where: { ownerId: userId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } },
  });
  if (activeProjects > 0) {
    return fail(
      `You have ${activeProjects} active project(s). Please complete or transfer ownership before deletion.`,
      400,
    );
  }

  // Anonymize PII + mark account.
  const anonymizedEmail = `deleted+${userId.slice(-8)}@gigsure.invalid`;
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        emailNormalized: anonymizedEmail,
        displayName: "Deleted User",
        passwordHash: null,
        accountStatus: "DELETED",
        deletedAt: new Date(),
      },
    }),
    db.userIdentity.deleteMany({ where: { userId } }),
    db.linkedAccount.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.emailVerificationToken.deleteMany({ where: { userId } }),
    db.passwordResetToken.deleteMany({ where: { userId } }),
    db.userProfile.deleteMany({ where: { userId } }),
    db.userPreferences.deleteMany({ where: { userId } }),
    db.notification.deleteMany({ where: { userId } }),
  ]);

  await db.privacyRequest.create({
    data: { userId, type: "DELETE", status: "COMPLETED", completedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "privacy.account_deleted",
    targetType: "User",
    targetId: userId,
    metadata: { originalEmailPrefix: user.email.slice(0, 3) },
  });

  return {
    deleted: true,
    message: "Account deleted. Sign out will occur.",
  };
});
