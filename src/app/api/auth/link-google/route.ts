/**
 * Link a Google identity to the currently authenticated account.
 *
 * SECURITY FLOW:
 *   1. User must be in sudo mode (requireRecentAuth — password re-verified
 *      via /api/auth/reauth within the last 15 minutes)
 *   2. Frontend initiates Google OAuth with a special `state` parameter
 *      containing `linking=true` + the user's session token
 *   3. Google redirects back to /api/auth/callback/google with an authorization code
 *   4. NextAuth processes the callback — but the signIn callback detects
 *      `state.linking=true` and instead of signing in, it calls this endpoint
 *      with the verified Google profile
 *   5. This endpoint verifies the Google sub isn't linked to another account,
 *      then creates the UserIdentity + LinkedAccount
 *
 * ALTERNATIVE FLOW (simpler, used here):
 *   1. User is in sudo mode
 *   2. Frontend opens Google's OAuth consent URL in a popup
 *   3. Google redirects back to a special page with the authorization code
 *   4. Frontend sends the code to this endpoint
 *   5. This endpoint exchanges the code server-side with Google's token endpoint
 *   6. Reads verified `sub` + `email` from Google's id_token
 *   7. Links the identity to the user's account
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId, requireRecentAuth } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { z } from "zod";

const Schema = z.object({
  code: z.string().min(10).max(500),
});

/**
 * Exchange a Google OAuth authorization code for tokens.
 * Returns the verified Google user info (sub, email, email_verified).
 */
async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  // Exchange authorization code for access token + id_token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    logSecurityEvent("error", "auth.google_token_exchange_failed", {
      status: tokenRes.status,
      body: errBody.slice(0, 200),
    });
    return null;
  }

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    id_token?: string;
  };

  if (!tokenData.id_token) {
    logSecurityEvent("error", "auth.google_no_id_token", {});
    return null;
  }

  // Decode the id_token (JWT) to get verified user info
  // The id_token is signed by Google — we verify the signature by
  // fetching Google's public keys, but for simplicity here we trust
  // the token endpoint response (the code was exchanged server-side
  // with our client_secret, so the response is from Google directly)
  const payload = JSON.parse(
    Buffer.from(tokenData.id_token.split(".")[1], "base64").toString("utf-8"),
  ) as {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
  };

  return payload;
}

export const POST = apiRoute(async (req) => {
  // SECURITY: Require sudo mode — prevents stolen session cookie from
  // adding a persistent OAuth backdoor
  const userId = await requireRecentAuth(15);

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid request — authorization code is required", 422);
  }

  // Build the redirect URI — must match the one used in the OAuth consent URL
  const { resolveBaseUrl } = await import("@/lib/auth/base-url");
  const baseUrl = resolveBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/callback/google`;

  // Exchange the authorization code with Google's token endpoint
  const googleUser = await exchangeGoogleCode(parsed.data.code, redirectUri);

  if (!googleUser) {
    return fail("Failed to verify Google identity. The authorization code may be expired or invalid.", 400);
  }

  // SECURITY: Verify Google confirmed the email
  if (!googleUser.email_verified) {
    logSecurityEvent("warn", "auth.link_google_email_not_verified", { userId });
    return fail("Google email is not verified. Please verify your email on Google first.", 400);
  }

  const googleSub = googleUser.sub;
  const email = normalizeEmail(googleUser.email);
  if (!validateEmail(email)) {
    return fail("Invalid email from Google", 400);
  }

  // Check if this Google identity is already linked to a DIFFERENT account
  const existingIdentity = await db.userIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: "google",
        providerSubject: googleSub,
      },
    },
    select: { id: true, userId: true },
  });

  if (existingIdentity && existingIdentity.userId !== userId) {
    logSecurityEvent("warn", "auth.link_refused_identity_in_use", {
      targetUserId: userId,
      ownerUserId: existingIdentity.userId,
    });
    return fail(
      "This Google account is already linked to another GigSure account.",
      409,
    );
  }

  // Already linked to this user — idempotent
  if (existingIdentity && existingIdentity.userId === userId) {
    return ok({ linked: true, already: true });
  }

  // Link the Google identity to the user's account
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

  // Invalidate sessions so the user must re-authenticate (the next login
  // can use Google directly since the identity is now linked)
  await db.user.update({
    where: { id: userId },
    data: { passwordChangedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.identity_linked",
    targetType: "User",
    targetId: userId,
    metadata: { provider: "google", email },
  });

  return ok({
    linked: true,
    message: "Google account linked successfully. You can now sign in with Google.",
  });
});
