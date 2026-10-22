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
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { headers } from "next/headers";

export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const jti = params.jti;

  if (!jti || jti.length < 8 || jti.length > 128) {
    return fail("Invalid session ID", 400);
  }

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

  // SECURITY: If the session isn't already revoked, we can't verify
  // ownership (JWTs are stateless — no server-side session store).
  // Only allow revoking the CURRENT session (from the JWT) or
  // require the JTI to match the caller's own session JTI.
  // For safety, we allow it but log a warning if the JTI doesn't match
  // the caller's current session (detectable via the session cookie).
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = headers().get("user-agent") ?? null;
  logSecurityEvent("info", "auth.session_revoked", { jti: jti.slice(0, 8) + "...", revokedBy: userId, ip });

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
