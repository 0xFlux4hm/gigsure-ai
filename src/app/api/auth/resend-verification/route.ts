/**
 * Resend email verification. Rate-limited via central rate limiter.
 *
 * replaced ad-hoc `resendStore` Map with the central
 * `checkRateLimit` rate limiter (which has periodic cleanup).
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { sendEmail, verificationEmail } from "@/lib/email/provider";
import { resolveBaseUrl } from "@/lib/auth/base-url";
import { logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { z } from "zod";

const Schema = z.object({ email: z.string().min(5).max(254) });

export const POST = apiRoute(async (req) => {
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid email", 422);

  const email = normalizeEmail(parsed.data.email);
  if (!validateEmail(email)) return fail("Invalid email", 400);

  // central rate limiter (has cleanup) instead of Map.
  const rateResult = await checkRateLimit(
    `resendverify:email:${email}`,
    RATE_LIMITS.RESEND_VERIFICATION_PER_EMAIL,
  );
  if (!rateResult.ok) {
    return fail("Too many requests. Please try again later.", 429);
  }

  // Look up user — but return same response either way to avoid enumeration.
  const user = await db.user.findUnique({
    where: { emailNormalized: email },
    select: { id: true, emailVerifiedAt: true },
  });
  let emailSent = false;
  let emailError: string | undefined;

  if (user && !user.emailVerifiedAt) {
    const rawToken = generateToken();
    await db.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    // Send verification email
    const baseUrl = resolveBaseUrl(req);
    const verificationUrl = `${baseUrl}/?view=verify-email&token=${rawToken}`;
    if (process.env.SMTP_URL) {
      const result = await sendEmail(verificationEmail(email, verificationUrl));
      if (result.ok) {
        emailSent = true;
      } else {
        emailError = result.error;
        logSecurityEvent("error", "email.verification_resend_failed", {
          userId: user.id,
          error: result.error,
        });
      }
    } else {
      logSecurityEvent("warn", "email.smtp_not_configured", {
        userId: user.id,
        message: "SMTP_URL not set — verification email was not sent.",
      });
    }
    // In dev: surface the token via log only.
    if (process.env.NODE_ENV !== "production") {
      console.info(`[dev] verification token for ${email}: ${rawToken}`);
    }
  }

  return ok({
    sent: true,
    emailSent,
    emailError,
    message: emailSent
      ? "A new verification link has been sent. Check your inbox (and spam folder)."
      : "If the email is registered and unverified, a new link has been sent. If you don't receive it, the email server may not be configured.",
  });
});
