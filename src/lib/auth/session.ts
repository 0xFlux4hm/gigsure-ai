/**
 * Server-side session helper. Re-exports getServerSession with our config.
 */
import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { authOptions } from "./nextauth-config";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { AuthnError } from "./authorization";

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

export function getClientIp(): string | null {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}
