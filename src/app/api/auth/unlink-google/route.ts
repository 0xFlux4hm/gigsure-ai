/**
 * Unlink a Google identity from the current account.
 *
 * SAFETY: refuse to unlink the user's LAST usable authentication method.
 * A user must always have at least one of: password, google, (future providers).
 *
 * requires recent reauthentication (sudo mode) to
 * prevent a stolen session cookie from being used to lock the victim out
 * of their account by unlinking all auth methods.
 *
 * SECURITY: On unlink, sets passwordChangedAt = now() to invalidate all
 * existing JWT sessions (so a stolen session cookie stops working after
 * Google is unlinked).
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireRecentAuth } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  provider: z.literal("google"),
  providerSubject: z.string().min(8).max(128),
});

export const POST = apiRoute(async (req) => {
  // sudo mode — prevent stolen-session lockout attacks.
  const userId = await requireRecentAuth(15);
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  // Check the user has another way to sign in (password or other identity)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  const identities = await db.userIdentity.findMany({
    where: { userId },
  });

  // SECURITY: Check both UserIdentity count AND passwordHash on the User record.
  // Previously only checked identities.length, which missed users who have a
  // password but no "password" UserIdentity row (edge case from data migration).
  const hasPassword = !!user?.passwordHash;
  const otherIdentities = identities.filter(
    (i) => !(i.provider === "google" && i.providerSubject === parsed.data.providerSubject),
  );

  if (otherIdentities.length === 0 && !hasPassword) {
    return fail(
      "You must keep at least one authentication method. Add another before removing this one.",
      400,
    );
  }

  const result = await db.userIdentity.deleteMany({
    where: {
      userId,
      provider: "google",
      providerSubject: parsed.data.providerSubject,
    },
  });
  await db.linkedAccount.deleteMany({
    where: {
      userId,
      provider: "google",
      providerSubject: parsed.data.providerSubject,
    },
  });

  // SECURITY: Only invalidate sessions if something was actually deleted
  // (prevents self-DoS where user submits a fake providerSubject)
  if (result.count === 0) {
    return fail("No matching Google identity found linked to your account.", 404);
  }

  // SECURITY: Invalidate all existing sessions by updating passwordChangedAt.
  // The JWT callback checks passwordChangedAt on every request and rejects
  // tokens issued before this timestamp. This ensures a stolen session cookie
  // stops working after Google is unlinked.
  await db.user.update({
    where: { id: userId },
    data: { passwordChangedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.identity_unlinked",
    targetType: "User",
    targetId: userId,
    metadata: { provider: "google" },
  });

  return ok({ unlinked: true });
});
