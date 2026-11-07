/**
 * List active sessions for the current user.
 *
 * Since we use JWT strategy (not database sessions), we can't list all
 * active JWTs from the DB. Instead, we list REVOKED sessions (so the user
 * can see what they've signed out) + the current session's info.
 *
 * The current session's JTI is exposed via the session callback so the
 * frontend can display "this device" in the UI.
 *
 * Future enhancement: switch to database session strategy to list ALL
 * active sessions with device fingerprints.
 */
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const GET = apiRoute(async () => {
  const userId = await requireUserId();

  // List revoked sessions (historical — shows what was signed out)
  const revokedSessions = await db.revokedSession.findMany({
    where: { userId },
    orderBy: { revokedAt: "desc" },
    take: 50,
    select: {
      id: true,
      jti: true,
      reason: true,
      userAgent: true,
      ipAddress: true,
      revokedAt: true,
    },
  });

  return {
    revokedSessions,
  };
});
