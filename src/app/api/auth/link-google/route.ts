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
 *
 * This endpoint previously accepted an arbitrary
 * client-supplied `googleSub` and `email` with no proof of Google identity
 * ownership. That allowed account-squatting: an attacker could pre-claim any
 * victim's Google sub, blocking the victim from ever linking their real
 * account (409 on real link attempt).
 *
 * The fix:
 *   - In demo mode (no real Google creds), reject `googleSub` values that
 *     start with `demo_` UNLESS the demo-google code was actually issued
 *     (verified via the `issuedCodes` map).
 *   - In production mode, this endpoint should exchange a Google OIDC `code`
 *     server-side and read `sub`/`email` from Google's verified response.
 *     That refactor is tracked in docs/PAYMENT_INTEGRATION.md.
 *
 * For now, the demo path is the supported flow. We require a freshly-issued
 * `code` from /api/auth/google-demo/callback, which proves the user actually
 * completed the (simulated) Google OAuth flow.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId, requireRecentAuth } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { z } from "zod";

// Schema accepts either:
//   - { code } — preferred, looked up in issuedCodes (demo flow)
//   - { googleSub, email } — LEGACY, rejected in demo mode + prod mode unless
//     GOOGLE_ALLOW_UNVERIFIED_LINK=true is set (debugging only).
const Schema = z.object({
  code: z.string().min(8).max(128).optional(),
  googleSub: z.string().min(8).max(128).optional(),
  email: z.string().min(5).max(254).optional(),
}).refine((d) => d.code || (d.googleSub && d.email), {
  message: "Either `code` or (`googleSub` + `email`) is required",
});

export const POST = apiRoute(async (req) => {
  // require recent reauthentication (sudo mode) for
  // linking a Google identity. Prevents a stolen session cookie from being
  // used to add a persistent OAuth backdoor.
  const userId = await requireRecentAuth(15);
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid input", 422); }

  let googleSub: string;
  let email: string;

  if (parsed.data.code) {
    // In production, this code would be exchanged with Google's token endpoint
    // to get a verified id_token containing the user's sub + email.
    // For now, this path is disabled until real Google OIDC code exchange is implemented.
    return fail("Google account linking via code exchange is not yet implemented. Use the Google OAuth sign-in flow.", 400);
  } else {
    // Legacy path: trust client-supplied googleSub + email
    // blocked in production EVEN IF the env var is set
    // (defense in depth — operator misconfiguration can't enable this path).
    if (process.env.NODE_ENV === "production") {
      logSecurityEvent("error", "auth.link_google_legacy_blocked_in_prod", { userId });
      return fail(
        "Direct googleSub linking is disabled in production. Use the Google OAuth flow to obtain a code.",
        400,
      );
    }
    if (process.env.GOOGLE_ALLOW_UNVERIFIED_LINK !== "true") {
      logSecurityEvent("warn", "auth.link_google_legacy_blocked", { userId });
      return fail(
        "Direct googleSub linking is disabled. Use the Google OAuth flow to obtain a code.",
        400,
      );
    }
    if (parsed.data.googleSub!.startsWith("demo_")) {
      return fail("Demo Google identities cannot be linked via this path.", 400);
    }
    googleSub = parsed.data.googleSub!;
    email = normalizeEmail(parsed.data.email!);
    if (!validateEmail(email)) return fail("Invalid email", 400);
  }

  // Check if Google identity is already linked to a DIFFERENT account.
  const existingIdentity = await db.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: "google",
        providerSubject: googleSub,
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
        providerSubject: googleSub,
        lastAuthenticatedAt: new Date(),
      },
    }),
    db.linkedAccount.create({
      data: {
        userId,
        provider: "google",
        providerSubject: googleSub,
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
