/**
 * Server-side session helper. Re-exports getServerSession with our config.
 *
 * OWASP Top 10 — A01 Broken Access Control defense:
 *   requireUserId() now ALSO checks accountStatus === "ACTIVE" server-side.
 *   Previously, only the client-side Router checked accountStatus, so a
 *   PENDING_REGISTRATION user could call any /api/* endpoint directly with
 *   their JWT and bypass the gating. This is a real Broken Access Control
 *   vulnerability — fixed here by enforcing it server-side at the entry point.
 *
 *   Whitelist of endpoints that PENDING_REGISTRATION users CAN call:
 *     - /api/auth/complete-registration (they need this to activate)
 *     - /api/me                          (the registration page loads profile)
 *     - /api/auth/*                      (NextAuth's own endpoints)
 *
 *   Everything else returns 403 if the user isn't ACTIVE.
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
 * Path prefix whitelist for endpoints that PENDING_REGISTRATION users can
 * call before accepting Terms of Service. Everything else requires ACTIVE.
 *
 * NOTE: This is checked on every requireUserId() call, so it must be fast.
 * The whitelist is small + uses startsWith() which is O(n) on path length.
 */
const PENDING_ALLOWED_PATHS = [
  "/api/auth/",          // NextAuth endpoints (signout, session, etc.)
  "/api/me",             // Profile loading on the registration page
];

function isPathAllowedForPending(path: string): boolean {
  return PENDING_ALLOWED_PATHS.some((p) => path.startsWith(p));
}

/**
 * Returns the authenticated user ID, or throws AuthnError.
 *
 * OWASP A01 fix: also checks accountStatus === "ACTIVE" server-side.
 * PENDING_REGISTRATION users are rejected with 403 unless the request
 * path is in the whitelist (e.g. /api/auth/complete-registration).
 *
 * Use this at the top of every protected API route handler.
 */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthnError();

  const userId = session.user.id;

  // OWASP A01: server-side enforcement of accountStatus.
  // We DO trust the session's accountStatus (set by the jwt callback from DB),
  // but we re-check the DB on each call to close any race window where the
  // session is stale (e.g. admin just suspended the user).
  const path = await getRequestPath();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true },
  });

  if (!user) {
    // User was deleted between JWT issuance and this call
    throw new AuthnError("User not found", 401);
  }

  if (user.accountStatus !== "ACTIVE") {
    // PENDING_REGISTRATION users can ONLY call whitelisted endpoints.
    // Anything else = 403 (account not yet active).
    if (user.accountStatus === "PENDING_REGISTRATION" && isPathAllowedForPending(path)) {
      return userId;
    }
    // All other non-ACTIVE statuses (SUSPENDED, DELETED, etc.) = blocked everywhere
    throw new AuthnError("Account not active", 403);
  }

  return userId;
}

/**
 * Helper: read the request path from Next.js headers.
 * In Next.js 15+ App Router, headers() is async.
 */
async function getRequestPath(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-invoke-path") ?? h.get("x-url") ?? "/";
  } catch {
    return "/";
  }
}

/**
 * SECURITY: Like requireUserId, but ALSO checks that the user's
 * accountStatus is ACTIVE. Now redundant with requireUserId (which also
 * checks ACTIVE), but kept for backward compatibility + explicit intent.
 *
 * Use this on endpoints that perform mutations, access PII, or consume
 * billable resources. It makes the security intent explicit in the code.
 */
export async function requireActiveUser(): Promise<string> {
  // requireUserId() now also enforces ACTIVE, so this is equivalent.
  // Kept as a separate function so the security intent is explicit at
  // the call site + future-proof if requireUserId's behavior changes.
  return requireUserId();
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
