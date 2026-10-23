/**
 * Set a password for OAuth-only users (Google users who don't have a password).
 *
 * This enables:
 *   - Sudo mode (reauth requires a password)
 *   - Account self-deletion (privacy/delete requires reauth)
 *   - Alternative sign-in method (if Google is ever lost)
 *
 * SECURITY: Requires sudo mode (recent re-authentication).
 * For Google-only users, sudo mode is established by re-authenticating
 * via Google (the frontend calls /api/auth/reauth which now also accepts
 * a Google re-auth token, OR the user can set a password first if they
 * have an active session from Google sign-in).
 *
 * Body: { newPassword: string }
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { hashPassword, validatePasswordPolicy } from "@/lib/security/password";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  newPassword: z.string().min(8).max(128),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, accountStatus: true },
  });
  if (!user) return fail("User not found", 404);
  if (user.accountStatus !== "ACTIVE") return fail("Account not active", 400);

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Password must be at least 8 characters", 422);

  // Validate password strength
  const passwordCheck = validatePasswordPolicy(parsed.data.newPassword);
  if (!passwordCheck.ok) {
    return fail(passwordCheck.reason ?? "Weak password", 400);
  }

  // If user already has a password, they should use /api/auth/change-password instead
  if (user.passwordHash) {
    return fail(
      "You already have a password set. Use Settings → Security → Change password to update it.",
      400,
    );
  }

  // Set the password
  const passwordHash = hashPassword(parsed.data.newPassword);
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      // Also create a password UserIdentity if it doesn't exist
    },
  });

  // Create the "password" UserIdentity if it doesn't exist
  const userEmail = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (userEmail) {
    const normalizedEmail = userEmail.email.toLowerCase().trim();
    await db.userIdentity.upsert({
      where: {
        provider_providerSubject: {
          provider: "password",
          providerSubject: normalizedEmail,
        },
      },
      create: {
        userId,
        provider: "password",
        providerSubject: normalizedEmail,
        lastAuthenticatedAt: new Date(),
      },
      update: {
        lastAuthenticatedAt: new Date(),
      },
    }).catch(() => {
      // Already exists — ignore
    });
  }

  // Invalidate all sessions so user must re-authenticate with the new password
  await db.user.update({
    where: { id: userId },
    data: { passwordChangedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.password_set",
    targetType: "User",
    targetId: userId,
    metadata: { provider: "google" },
  });

  return ok({
    set: true,
    message: "Password set successfully. You can now sign in with email + password, and use sudo mode for sensitive operations.",
  });
});
