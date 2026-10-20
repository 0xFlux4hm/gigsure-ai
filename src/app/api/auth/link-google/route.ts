/**
 * Link a Google identity to the currently authenticated account.
 *
 * Per spec 7.6:
 *   1. Identify the existing account (caller must be signed in).
 *   2. Verify the Google identity (here: from the demo Google userinfo; in
 *      production: via real Google OIDC `sub`).
 *   3. Check whether the identity is already linked elsewhere.
 *   4. Link transactionally.
 *   5. Audit event.
 *
 * Auto-merge by email is FORBIDDEN. Even if the email strings match, we will
 * NOT silently transfer a Google identity from one account to another.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { z } from "zod";

const Schema = z.object({
  googleSub: z.string().min(8).max(128),
  email: z.string().min(5).max(254),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const email = normalizeEmail(parsed.data.email);
  if (!validateEmail(email)) return fail("Invalid email", 400);

  // Check if Google identity is already linked to a DIFFERENT account.
  const existingIdentity = await db.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: "google",
        providerSubject: parsed.data.googleSub,
      },
    },
    include: { user: { select: { id: true, email: true } } },
  });

  if (existingIdentity && existingIdentity.userId !== userId) {
    logSecurityEvent("warn", "auth.link_refused_identity_in_use", {
      targetUserId: userId,
      ownerUserId: existingIdentity.userId,
    });
    return fail(
      "This Google identity is already linked to another GigSure account.",
      409,
    );
  }

  if (existingIdentity && existingIdentity.userId === userId) {
    return ok({ linked: true, already: true });
  }

  await db.$transaction([
    db.userIdentity.create({
      data: {
        userId,
        provider: "google",
        providerSubject: parsed.data.googleSub,
        lastAuthenticatedAt: new Date(),
      },
    }),
    db.linkedAccount.create({
      data: {
        userId,
        provider: "google",
        providerSubject: parsed.data.googleSub,
      },
    }),
  ]);

  await recordAuditEvent({
    actorId: userId,
    action: "auth.identity_linked",
    targetType: "User",
    targetId: userId,
    metadata: { provider: "google" },
  });

  return ok({ linked: true });
});
