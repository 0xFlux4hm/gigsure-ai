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

  // SECURITY: Per-email rate limit (prevents targeting one user)
  const rateResult = await checkRateLimit(
    `forgotpw:email:${email}`,
    RATE_LIMITS.FORGOT_PASSWORD_PER_EMAIL,
  );
  if (!rateResult.ok) {
    return fail("Too many requests. Please try again later.", 429);
  }

  // SECURITY: Per-IP rate limit (prevents mass email amplification)
  const ip = await getClientIp();
  if (ip) {
    const ipRate = await checkRateLimit(`forgotpw:ip:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 });
    if (!ipRate.ok) {
      return fail("Too many requests from this IP. Please try again later.", 429);
    }
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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes — prevents squatting
      },
    });

    // Send the password reset email
    const baseUrl = resolveBaseUrl(req);
    const resetUrl = `${baseUrl}/?view=reset-password&token=${rawToken}`;
    if (process.env.SMTP_URL) {
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
    // SECURITY: Equalize timing for unregistered emails — perform dummy work
    // that takes approximately the same time as the registered path (token
    // creation + SMTP send + audit event). This prevents timing-based email
    // enumeration via response latency.
    const dummyStart = Date.now();
    // Hash a dummy token to simulate the cost of token creation
    hashToken(generateToken());
    // Simulate SMTP latency (~200-300ms)
    const elapsed = Date.now() - dummyStart;
    if (elapsed < 200) {
      await new Promise((r) => setTimeout(r, 200 - elapsed));
    }
    logSecurityEvent("info", "auth.forgot_password_unregistered", { email });
  }

  return ok({
    sent: true,
    message: "If the email is registered, a reset link has been sent.",
  });
});
