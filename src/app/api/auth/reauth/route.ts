/**
 * Reauthentication endpoint (sudo mode).
 *
 * Supports TWO re-authentication methods:
 *   1. Password verification (for users who have a password)
 *   2. Google re-authentication code (for OAuth-only users)
 *
 * For Google-only users: the frontend opens Google's OAuth consent URL
 * in a popup, receives an authorization code, and sends it here.
 * The code is exchanged server-side for a verified Google id_token.
 *
 * Body:
 *   { currentPassword: string } — for password users
 *   { googleCode: string } — for Google-only users
 *
 * Returns: { sudoToken: string } — passed to update({ sudoToken }) to elevate
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/security/password";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { z } from "zod";

const SUDO_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

const Schema = z.object({
  currentPassword: z.string().min(1).max(1024).optional(),
  googleCode: z.string().min(10).max(500).optional(),
}).refine(
  (data) => data.currentPassword || data.googleCode,
  "Either currentPassword or googleCode is required",
);

/**
 * Exchange a Google OAuth authorization code for verified user info.
 * Used for Google-only users who need sudo mode but have no password.
 */
async function verifyGoogleCode(code: string, redirectUri: string): Promise<{
  sub: string;
  email: string;
  email_verified: boolean;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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

  if (!tokenRes.ok) return null;

  const tokenData = await tokenRes.json() as { id_token?: string };
  if (!tokenData.id_token) return null;

  const payload = JSON.parse(
    Buffer.from(tokenData.id_token.split(".")[1], "base64").toString("utf-8"),
  ) as { sub: string; email: string; email_verified: boolean };

  return payload;
}

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  // SECURITY: Rate limit reauth attempts
  const rateResult = await checkRateLimit(`reauth:user:${userId}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rateResult.ok) {
    return fail("Too many reauthentication attempts. Please try again later.", 429);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, accountStatus: true },
  });
  if (!user) return fail("User not found", 404);
  if (user.accountStatus !== "ACTIVE") return fail("Account not active", 400);

  let authenticated = false;
  let authMethod = "";

  // Method 1: Password verification
  if (parsed.data.currentPassword) {
    if (!user.passwordHash) {
      return fail(
        "Password authentication is not enabled on this account. Use Google re-authentication or set a password first.",
        400,
      );
    }
    if (!verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      logSecurityEvent("warn", "auth.reauth_failed", { userId });
      return fail("Current password is incorrect", 403);
    }
    authenticated = true;
    authMethod = "password";
  }

  // Method 2: Google re-authentication code
  if (parsed.data.googleCode && !authenticated) {
    const { resolveBaseUrl } = await import("@/lib/auth/base-url");
    const redirectUri = `${resolveBaseUrl(req)}/api/auth/callback/google`;
    const googleUser = await verifyGoogleCode(parsed.data.googleCode, redirectUri);

    if (!googleUser || !googleUser.email_verified) {
      logSecurityEvent("warn", "auth.reauth_google_failed", { userId });
      return fail("Google re-authentication failed. Please try again.", 403);
    }

    // Verify this Google identity belongs to the current user
    const identity = await db.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "google",
          providerSubject: googleUser.sub,
        },
      },
      select: { userId: true },
    });

    if (!identity || identity.userId !== userId) {
      logSecurityEvent("warn", "auth.reauth_google_mismatch", { userId });
      return fail("This Google account is not linked to your account.", 403);
    }

    authenticated = true;
    authMethod = "google";
  }

  if (!authenticated) {
    return fail("Authentication failed. Please provide either your password or a Google re-authentication code.", 403);
  }

  // Issue sudo token
  const rawSudoToken = generateToken(32);
  const sudoTokenHash = hashToken(rawSudoToken);
  const expiresAt = new Date(Date.now() + SUDO_TOKEN_EXPIRY_MS);

  await db.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: sudoTokenHash,
      expiresAt,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: `auth.reauth_success_${authMethod}`,
    targetType: "User",
    targetId: userId,
  });

  return ok({
    reauthenticated: true,
    sudoToken: rawSudoToken,
    message: "Sudo mode active for 15 minutes. Retry your action.",
    refreshSession: true,
  });
});
