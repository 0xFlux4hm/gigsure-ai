/**
 * Forgot-password request.
 *
 * ALWAYS returns the same response shape to prevent account enumeration.
 * If the email is registered, a single-use token (24h) is created and the
 * raw token is logged in dev mode (in prod it would be emailed).
 *
 * replaced ad-hoc `forgotStore` Map with the central
 * `checkRateLimit` rate limiter (which has periodic cleanup). Old code
 * leaked memory indefinitely.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { sendEmail, passwordResetEmail } from "@/lib/email/provider";
import { resolveBaseUrl } from "@/lib/auth/base-url";
import { z } from "zod";

const Schema = z.object({ email: z.string().min(5).max(254) });

export const POST = apiRoute(async (req) => {
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid email", 422);

  const email = normalizeEmail(parsed.data.email);
  if (!validateEmail(email)) return fail("Invalid email", 400);

  // use the central rate limiter (has periodic cleanup)
  // instead of an ad-hoc Map that grows indefinitely.
  const rateResult = await checkRateLimit(
    `forgotpw:email:${email}`,
    RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL,
  );
  if (!rateResult.ok) {
    return fail("Too many requests. Please try again later.", 429);
  }

  const user = await db.user.findUnique({
    where: { emailNormalized: email },
    select: { id: true },
  });
  if (user) {
    const rawToken = generateToken();
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1h
      },
    });

    // Send the password reset email
    const baseUrl = resolveBaseUrl(req);
    const resetUrl = `${baseUrl}/?view=reset-password&token=${rawToken}`;
    if (process.env.NODE_ENV === "production" || process.env.SMTP_URL) {
      const result = await sendEmail(passwordResetEmail(email, resetUrl));
      if (!result.ok) {
        logSecurityEvent("error", "email.password_reset_send_failed", {
          userId: user.id,
          error: result.error,
        });
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.info(`[dev] password reset token hash for ${email}: ${hashToken(rawToken).slice(0, 16)}...`);
    }
    await recordAuditEvent({
      actorId: user.id,
      action: "auth.password_reset_requested",
      targetType: "User",
      targetId: user.id,
    });
  } else {
    logSecurityEvent("info", "auth.password_reset_unknown_email", { email });
  }

  return ok({
    sent: true,
    message: "If the email is registered, a reset link has been sent.",
  });
});
