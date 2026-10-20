/**
 * Reset password using a single-use token.
 *
 * After a successful reset:
 *   - mark token consumed
 *   - update passwordHash
 *   - revoke all sessions (caller must re-authenticate)
 *   - audit event
 *   - notify user via in-app notification
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { hashToken } from "@/lib/security/tokens";
import { hashPassword, validatePasswordPolicy } from "@/lib/security/password";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  token: z.string().min(16).max(128),
  newPassword: z.string().min(8).max(128),
});

export const POST = apiRoute(async (req) => {
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const pwCheck = validatePasswordPolicy(parsed.data.newPassword);
  if (!pwCheck.ok) return fail(pwCheck.reason ?? "Weak password", 400);

  const tokenHash = hashToken(parsed.data.token);
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record) return fail("Invalid or expired token", 400);
  if (record.consumedAt) return fail("Token already used", 400);
  if (record.expiresAt < new Date()) return fail("Token expired", 400);

  // SECURITY (2026-10): atomic conditional update — `updateMany` with
  // `where: { id, consumedAt: null }` so concurrent same-token requests
  // can't both succeed. The loser returns count=0 and we 400.
  const newHash = hashPassword(parsed.data.newPassword);
  const now = new Date();
  const consumed = await db.passwordResetToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    return fail("Token already used", 400);
  }
  await db.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: newHash,
      // SECURITY (2026-10): invalidate all existing JWTs
      passwordChangedAt: now,
      lastLoginAt: now,
    },
  });

  // Notify user
  await db.notification.create({
    data: {
      userId: record.userId,
      type: "SECURITY",
      title: "Password changed",
      body: "Your password was just changed. If this was not you, please contact support immediately.",
    },
  });

  await recordAuditEvent({
    actorId: record.userId,
    action: "auth.password_reset_completed",
    targetType: "User",
    targetId: record.userId,
  });

  return ok({
    reset: true,
    message: "Password reset. Please sign in with your new password.",
  });
});
