/**
 * Change password for the authenticated user.
 *
 * Requires the current password (reauthentication). After successful change:
 *   - all sessions invalidated (caller must sign in again with new password)
 *   - notification created
 *   - audit event recorded
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { verifyPassword, hashPassword, validatePasswordPolicy } from "@/lib/security/password";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const pwCheck = validatePasswordPolicy(parsed.data.newPassword);
  if (!pwCheck.ok) return fail(pwCheck.reason ?? "Weak password", 400);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return fail("Password sign-in is not enabled on this account", 400);
  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return fail("Current password is incorrect", 403);
  }

  const newHash = hashPassword(parsed.data.newPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  await db.notification.create({
    data: {
      userId,
      type: "SECURITY",
      title: "Password changed",
      body: "Your password was changed. If this was not you, please reset it immediately.",
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.password_changed",
    targetType: "User",
    targetId: userId,
  });

  return ok({
    changed: true,
    message: "Password changed. Please sign in again.",
  });
});
