/**
 * Reauthentication endpoint (sudo mode).
 *
 * Accepts the user's current password, verifies it, and issues a one-time
 * sudo token that the frontend passes back via the session update mechanism.
 *
 * SECURITY: The sudo elevation is gated by a server-issued one-time token
 * (not by a client-supplied boolean). The token is stored in the DB with
 * a 15-minute expiry and single-use constraint. When the frontend calls
 * `update({ sudoToken: "..." })`, the jwt callback verifies the token
 * server-side before refreshing issuedAt.
 *
 * Flow:
 *   1. Frontend calls a sensitive endpoint (e.g., /api/auth/link-google)
 *   2. That endpoint calls requireRecentAuth(15) → throws 401 requireReauth
 *   3. Frontend shows a password prompt
 *   4. User enters password → frontend POSTs to /api/auth/reauth
 *   5. This endpoint verifies the password + issues a one-time sudo token
 *   6. Frontend calls `await update({ sudoToken: "..." })`
 *   7. jwt callback verifies the token server-side, refreshes issuedAt
 *   8. Frontend retries the original sensitive endpoint → now succeeds
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/security/password";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { z } from "zod";

const SUDO_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const Schema = z.object({
  currentPassword: z.string().min(1).max(1024),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, accountStatus: true },
  });
  if (!user) return fail("User not found", 404);
  if (user.accountStatus !== "ACTIVE") return fail("Account not active", 400);

  // OAuth-only accounts can't reauthenticate via password
  if (!user.passwordHash) {
    return fail(
      "Password authentication is not enabled on this account. Set a password first to use sudo mode.",
      400,
    );
  }

  // Verify the current password
  if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    logSecurityEvent("warn", "auth.reauth_failed", { userId });
    return fail("Current password is incorrect", 403);
  }

  // SECURITY: Issue a one-time sudo token (stored hashed in DB).
  // The frontend passes this token to update(); the jwt callback verifies
  // it server-side before refreshing issuedAt. This prevents the client
  // from arbitrarily elevating sudo mode without password verification.
  const rawSudoToken = generateToken(32);
  const sudoTokenHash = hashToken(rawSudoToken);
  const expiresAt = new Date(Date.now() + SUDO_TOKEN_EXPIRY_MS);

  // Store the token hash (single-use, 15-minute expiry)
  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: sudoTokenHash,
      expiresAt,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.reauth_success",
    targetType: "User",
    targetId: userId,
  });

  return ok({
    reauthenticated: true,
    sudoToken: rawSudoToken,
    message: "Sudo mode active for 15 minutes. Retry your action.",
    refreshSession: true,
  });
});
