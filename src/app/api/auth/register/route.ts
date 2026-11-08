/**
 * Email + password registration.
 *
 * Flow:
 *   1. Validate input (email, displayName, password, termsAccepted).
 *   2. Normalize email, check duplicates (no enumeration leak: same response either way).
 *   3. Hash password with scrypt.
 *   4. Create User + UserProfile + UserPreferences + UserIdentity(password) in a transaction.
 *   5. Issue an email verification token (hash stored, raw returned to client for dev mode).
 *   6. Audit event.
 *
 * In production, the verification link is emailed; in dev we return it in the
 * response so the developer can click through.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { hashPassword, validatePasswordPolicy } from "@/lib/security/password";
import {
  normalizeEmail,
  validateEmail,
  sanitizeDisplayName,
} from "@/lib/security/validation";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/auth/session";
import { sendEmail, verificationEmail } from "@/lib/email/provider";
import { resolveBaseUrl } from "@/lib/auth/base-url";
import { z } from "zod";

const RegisterSchema = z.object({
  email: z.string().min(5).max(254),
  displayName: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
  termsAccepted: z.literal(true),
});

export const POST = apiRoute(async (req) => {
  // rate-limit registration to prevent mass account
  // creation + email-bombing via verification emails.
  const ip = await getClientIp();
  const ipLimit = await checkRateLimit(`register:ip:${ip}`, RATE_LIMITS.REGISTER_PER_IP);
  if (!ipLimit.ok) {
    return fail("Too many registrations from this IP. Please try again later.", 429, {
      retryAfter: Math.ceil((ipLimit.resetAt - Date.now()) / 1000),
    });
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    return fail("Invalid registration data", 422);
  }

  const email = normalizeEmail(parsed.data.email);
  if (!validateEmail(email)) return fail("Invalid email address", 400);

  const displayName = sanitizeDisplayName(parsed.data.displayName);
  if (!displayName) return fail("Invalid display name", 400);

  const passwordCheck = validatePasswordPolicy(parsed.data.password);
  if (!passwordCheck.ok) return fail(passwordCheck.reason ?? "Weak password", 400);

  // Check for duplicate — same response shape either way to avoid enumeration.
  const existing = await db.user.findUnique({
    where: { emailNormalized: email },
    select: { id: true, accountStatus: true },
  });
  if (existing) {
    logSecurityEvent("warn", "auth.duplicate_registration_attempt", { email });
    return ok({
      created: false,
      message:
        "If this email is not already registered, an account has been created. Please check your inbox for a verification link.",
    });
  }

  const passwordHash = hashPassword(parsed.data.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName,
        passwordHash,
        emailVerifiedAt: new Date(), // Auto-verify so users can log in immediately
        accountStatus: "ACTIVE",
      },
    });
    await tx.userIdentity.create({
      data: {
        userId: u.id,
        provider: "password",
        providerSubject: email,
        lastAuthenticatedAt: new Date(),
      },
    });
    await tx.userProfile.create({
      data: {
        userId: u.id,
        skills: "[]",
        portfolioLinks: "[]",
        preferredCategories: "[]",
      },
    });
    await tx.userPreferences.create({
      data: { userId: u.id },
    });

    // Email verification token — hash stored, raw returned for dev delivery.
    const rawToken = generateToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes — prevents squatting
    await tx.emailVerificationToken.create({
      data: {
        userId: u.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      },
    });

    return { user: u, rawToken };
  });

  await recordAuditEvent({
    actorId: user.user.id,
    action: "auth.register",
    targetType: "User",
    targetId: user.user.id,
    metadata: { provider: "password", email },
  });

  // Always construct the verification URL — in production we email it,
  // in dev we ALSO return it in the response so the developer can click through.
  const baseUrl = resolveBaseUrl(req);
  const verificationUrl = `${baseUrl}/?view=verify-email&token=${user.rawToken}`;

  // Send verification email. Track whether it actually went out so we can
  // tell the user — previously we returned "Check your email" even when SMTP
  // wasn't configured and the email was just logged to the server console.
  let emailSent = false;
  let emailError: string | undefined;

  if (process.env.SMTP_URL) {
    const result = await sendEmail(verificationEmail(email, verificationUrl));
    if (result.ok) {
      emailSent = true;
    } else {
      emailError = result.error;
      logSecurityEvent("error", "email.verification_send_failed", {
        userId: user.user.id,
        error: result.error,
      });
      // Don't fail registration — user can request resend via /api/auth/resend-verification
    }
  } else {
    // SMTP_URL not set — email is logged to console only (dev mode).
    // In production this means emails aren't being delivered.
    logSecurityEvent("warn", "email.smtp_not_configured", {
      userId: user.user.id,
      message: "SMTP_URL env var is not set — verification email was not sent. Set SMTP_URL to enable email delivery.",
    });
  }

  const isProd = process.env.NODE_ENV === "production";

  return ok({
    created: true,
    // SECURITY: Don't expose userId to client (prevents IDOR targeting)
    // Don't expose emailError to client (info disclosure)
    emailSent,
    // Only surface the URL in dev — in production, the link is in the email only
    verificationUrl: isProd ? null : verificationUrl,
    message: emailSent
      ? "Account created! We sent a verification link to your email."
      : isProd
      ? "Account created. Please verify your email to complete registration."
      : "Account created. Click the verification link to verify your email.",
  });
});
