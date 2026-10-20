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
    throw new AuthzError("Administrator access required", 403);
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

export function getClientIp(): string | null {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}
