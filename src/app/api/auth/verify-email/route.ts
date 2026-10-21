/**
 * Verify a user's email using a single-use, expiring token.
 *
 * The raw token is supplied via `?token=`. We hash it and look up the matching
 * record. Tokens are single-use (consumedAt) and expire after 24h.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { hashToken, constantTimeEqual } from "@/lib/security/tokens";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const VerifySchema = z.object({ token: z.string().min(16).max(128) });

export const POST = apiRoute(async (req) => {
  const body = await parseJsonBody<unknown>(req);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid token", 422);
  }

  const tokenHash = hashToken(parsed.data.token);
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record) return fail("Invalid or expired token", 400);
  if (record.consumedAt) return fail("Token already used", 400);
  if (record.expiresAt < new Date()) return fail("Token expired", 400);

  // atomic conditional update — `updateMany` with
  // `where: { id, consumedAt: null }` so two concurrent requests with the
  // same token can't both pass the consumedAt check. The loser's updateMany
  // returns count=0, and we return "already used" without doing the user
  // update.
  const consumed = await db.emailVerificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    return fail("Token already used", 400);
  }

  await db.user.update({
    where: { id: record.userId },
    data: { emailVerifiedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: record.userId,
    action: "auth.email_verified",
    targetType: "User",
    targetId: record.userId,
  });

  return ok({ verified: true });
});
