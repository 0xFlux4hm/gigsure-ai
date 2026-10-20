/**
 * Resend email verification. Rate-limited to 3 requests per 10 minutes
 * (in-memory counter — production should use Redis).
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { sendEmail, verificationEmail } from "@/lib/email/provider";
import { logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const resendStore = new Map<string, { count: number; firstAt: number }>();

const Schema = z.object({ email: z.string().min(5).max(254) });

export const POST = apiRoute(async (req) => {
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid email", 422);

  const email = normalizeEmail(parsed.data.email);
  if (!validateEmail(email)) return fail("Invalid email", 400);

  // Rate limit (per-email, in-memory).
  const now = Date.now();
  const entry = resendStore.get(email);
  if (entry) {
    if (now - entry.firstAt < 10 * 60 * 1000 && entry.count >= 3) {
      return fail("Too many requests. Please try again later.", 429);
    }
    if (now - entry.firstAt >= 10 * 60 * 1000) {
      resendStore.set(email, { count: 1, firstAt: now });
    } else {
      entry.count += 1;
    }
  } else {
    resendStore.set(email, { count: 1, firstAt: now });
  }

  // Look up user — but return same response either way to avoid enumeration.
  const user = await db.user.findUnique({
    where: { emailNormalized: email },
    select: { id: true, emailVerifiedAt: true },
  });
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
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const verificationUrl = `${baseUrl}/?view=verify-email&token=${rawToken}`;
    if (process.env.NODE_ENV === "production" || process.env.SMTP_URL) {
      const result = await sendEmail(verificationEmail(email, verificationUrl));
      if (!result.ok) {
        logSecurityEvent("error", "email.verification_resend_failed", {
          userId: user.id,
          error: result.error,
        });
      }
    }
    // In dev: surface the token via log only.
    if (process.env.NODE_ENV !== "production") {
      console.info(`[dev] verification token for ${email}: ${rawToken}`);
    }
  }

  return ok({
    sent: true,
    message: "If the email is registered and unverified, a new link has been sent.",
  });
});
