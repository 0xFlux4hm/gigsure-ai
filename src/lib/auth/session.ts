/**
 * Server-side session helper. Re-exports getServerSession with our config.
 */
import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { authOptions } from "./nextauth-config";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { AuthnError, AuthzError } from "./authorization";

export async function getSession(): Promise<Session | null> {
  return await getServerSession(authOptions);
}

/**
 * Returns the authenticated user ID, or throws AuthnError.
 * Use this at the top of every protected API route handler.
 */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthnError();
  return session.user.id;
}

/** Returns the authenticated user (with sensitive fields), or null. */
export async function getAuthenticatedUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  return db.user.findUnique({
    where: { id: session.user.id },
    include: {
      profile: true,
      preferences: true,
      identities: true,
    },
  });
}

/**
 * Returns the authenticated admin user, or throws AuthzError.
 * Use this at the top of every admin-only API route handler.
 *
 * Admin status is determined by:
 *   1. User.platformRole === "ADMIN" in the database (preferred)
 *   2. User's email matches ADMIN_EMAILS env var (comma-separated, for bootstrapping)
 *
 * The env-var fallback lets you bootstrap the first admin without DB access:
 *   ADMIN_EMAILS=founder@example.com,ops@example.com
 *
 * includes a per-admin rate limit (30/min) to prevent
 * admin endpoints from being used as DoS amplifiers (e.g. /api/admin/stats
 * runs 35+ DB queries per request).
 */
export async function requireAdmin(): Promise<{ userId: string; email: string; displayName: string }> {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, platformRole: true, accountStatus: true },
  });
  if (!user) throw new AuthnError("User not found", 401);
  if (user.accountStatus !== "ACTIVE") throw new AuthzError("Account not active", 403);

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const isAdminByEnv = adminEmails.includes(user.email.toLowerCase());
  const isAdminByDb = user.platformRole === "ADMIN";

  if (!isAdminByDb && !isAdminByEnv) {
    // SECURITY: Return 404 (not 403) for non-admins so admin endpoints
    // appear not to exist. A 403 confirms the endpoint exists; a 404
    // makes it look like a dead link — preventing endpoint enumeration.
    throw new AuthzError("Not found", 404);
  }

  // Auto-promote: if env grants admin but DB doesn't, sync the DB.
  if (!isAdminByDb && isAdminByEnv) {
    await db.user.update({
      where: { id: userId },
      data: { platformRole: "ADMIN" },
    });
  }

  return { userId: user.id, email: user.email, displayName: user.displayName };
}

/**
 * Like requireAdmin, but also enforces a per-admin rate limit.
 * Use this for expensive admin GET endpoints (stats, audit, etc.) to prevent
 * DoS amplification (e.g. /api/admin/stats runs 35+ queries per request).
 *
 * Default: 30 requests per minute per admin.
 */
export async function requireAdminRateLimited(
  limit = 30,
  windowMs = 60 * 1000,
): Promise<{ userId: string; email: string; displayName: string }> {
  const admin = await requireAdmin();
  // Lazy import to avoid circular dependency
  const { checkRateLimit } = await import("@/lib/security/rate-limit");
  const result = await checkRateLimit(`admin:${admin.userId}`, { limit, windowMs });
  if (!result.ok) {
    throw new AuthzError("Rate limit exceeded. Please slow down.", 429);
  }
  return admin;
}

/** Returns true if the current user is an admin (no throw). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user?.id) return false;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { platformRole: true, email: true },
  });
  if (!user) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return user.platformRole === "ADMIN" || adminEmails.includes(user.email.toLowerCase());
}

/**
 * "sudo mode" — requires the session to have been
 * issued within the last `maxAgeMinutes` minutes. Use this for sensitive
 * actions like linking/unlinking OAuth identities, changing email, etc.
 *
 * Returns the userId if recent auth, otherwise throws AuthnError with
 * status 401 and a `requireReauth: true` flag in the message.
 *
 * Implementation: NextAuth's jwt callback sets `token.issuedAt = Date.now()`
 * only when a fresh login occurs (not on session refresh). The frontend
 * should call /api/auth/reauth (TODO) to refresh issuedAt after prompting
 * for the password.
 */
export async function requireRecentAuth(maxAgeMinutes = 15): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthnError();

  // SECURITY: Read issuedAt from session.user (not top-level session).
  // The session() callback in nextauth-config.ts writes issuedAt onto
  // session.user, not onto the top-level session object.
  const user = session.user as { issuedAt?: number };
  const issuedAt = user.issuedAt;

  if (!issuedAt || Date.now() - issuedAt > maxAgeMinutes * 60 * 1000) {
    const err = new AuthnError("Recent authentication required", 401);
    (err as Error & { requireReauth?: boolean }).requireReauth = true;
    throw err;
  }
  return session.user.id;
}

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}
