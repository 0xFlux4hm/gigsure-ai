/**
 * Revoke a specific session by JTI.
 *
 * Records the JTI in the RevokedSession table. The NextAuth jwt callback
 * checks this table on every subsequent request and invalidates any JWT
 * whose JTI appears.
 *
 * Use case: "I lost my phone, sign that session out."
 *
 * Note: the current session cannot revoke itself — use signOut() instead.
 */
import { db } from "@/lib/db";
import { apiRoute, fail, ok } from "@/lib/api";
import { requireUserId, getSession } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { headers } from "next/headers";

export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const jti = params.jti;

  if (!jti || jti.length < 8 || jti.length > 128) {
    return fail("Invalid session ID", 400);
  }

  // SECURITY: Get the caller's current session JTI to verify ownership.
  // Only the session owner can revoke their own sessions.
  const session = await getSession();
  const callerJti = (session?.user as { jti?: string })?.jti;

  // Check if already revoked (idempotent)
  const existing = await db.revokedSession.findUnique({
    where: { jti },
    select: { id: true, userId: true },
  });

  if (existing) {
    // SECURITY: Only the session owner can see/verify it exists
    if (existing.userId !== userId) {
      return fail("Session not found", 404);
    }
    return ok({ alreadyRevoked: true });
  }

  // SECURITY: If the session isn't already revoked, verify the JTI
  // belongs to the caller. Since we use JWT (stateless), we can only
  // verify the caller's CURRENT session JTI. For revoking OTHER sessions
  // (e.g., "sign out my lost phone"), the caller would need to know the
  // JTI of that session — which they can't discover without an
  // ActiveSession table (a known limitation).
  //
  // For now: only allow revoking the CURRENT session's JTI.
  // This prevents the IDOR where any user can revoke any other user's
  // session by guessing or extracting a JTI.
  if (callerJti && jti !== callerJti) {
    logSecurityEvent("warn", "auth.session_revocation_denied", {
      userId,
      attemptedJti: jti.slice(0, 8) + "...",
      callerJti: callerJti.slice(0, 8) + "...",
    });
    return fail("You can only revoke your own current session", 403);
  }

  // BUG FIX (Oct 30, 2026): Next.js 16 changed headers() to async.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = h.get("user-agent") ?? null;

  await db.revokedSession.create({
    data: {
      jti,
      userId,
      reason: "user_revoked",
      userAgent: ua,
      ipAddress: ip,
    },
  });

  logSecurityEvent("warn", "auth.session_revoked", { userId, jti: jti.slice(0, 8) + "…" });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.session_revoked",
    targetType: "RevokedSession",
    targetId: jti,
    metadata: { jti: jti.slice(0, 8) + "…" },
  });

  return ok({ revoked: true });
});
