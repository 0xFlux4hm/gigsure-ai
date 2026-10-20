/**
 * Unlink a Google identity from the current account.
 *
 * SAFETY: refuse to unlink the user's LAST usable authentication method.
 * A user must always have at least one of: password, google, (future providers).
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  provider: z.literal("google"),
  providerSubject: z.string().min(8).max(128),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const identities = await db.userIdentity.findMany({
    where: { userId },
  });
  if (identities.length <= 1) {
    return fail(
      "You must keep at least one authentication method. Add another before removing this one.",
      400,
    );
  }

  await db.userIdentity.deleteMany({
    where: {
      userId,
      provider: "google",
      providerSubject: parsed.data.providerSubject,
    },
  });
  await db.linkedAccount.deleteMany({
    where: {
      userId,
      provider: "google",
      providerSubject: parsed.data.providerSubject,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.identity_unlinked",
    targetType: "User",
    targetId: userId,
    metadata: { provider: "google" },
  });

  return ok({ unlinked: true });
});
