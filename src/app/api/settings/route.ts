/** Update user preferences. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { validateCurrency } from "@/lib/security/validation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  preferredCurrency: z.string().max(8).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  aiFeatureDisclosure: z.boolean().optional(),
});

export const GET = apiRoute(async () => {
  const userId = await requireUserId();
  const prefs = await db.userPreferences.findUnique({ where: { userId } });
  return prefs;
});

export const PUT = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid preferences", 422);

  const data = parsed.data;
  if (data.preferredCurrency && !validateCurrency(data.preferredCurrency)) {
    return fail("Unsupported currency", 400);
  }

  const updated = await db.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      preferredCurrency: data.preferredCurrency ?? "NGN",
      emailNotifications: data.emailNotifications ?? true,
      pushNotifications: data.pushNotifications ?? true,
      marketingEmails: data.marketingEmails ?? false,
      aiFeatureDisclosure: data.aiFeatureDisclosure ?? true,
    },
    update: {
      preferredCurrency: data.preferredCurrency ?? undefined,
      emailNotifications: data.emailNotifications ?? undefined,
      pushNotifications: data.pushNotifications ?? undefined,
      marketingEmails: data.marketingEmails ?? undefined,
      aiFeatureDisclosure: data.aiFeatureDisclosure ?? undefined,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "preferences.updated",
    targetType: "UserPreferences",
    targetId: userId,
  });

  return updated;
});
