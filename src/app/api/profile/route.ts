/**
 * Update user profile. Mass-assignment protected by an explicit allowlist.
 * All user-supplied text is sanitised before storage.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { sanitizeDisplayName } from "@/lib/security/validation";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const SkillsArray = z.array(z.string().min(1).max(80)).max(50);
const LinksArray = z.array(z.string().url().max(2048)).max(20);
const CatsArray = z.array(z.string().min(2).max(80)).max(20);

const ProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  headline: z.string().max(160).optional(),
  bio: z.string().max(4000).optional(),
  country: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  preferredLanguage: z.string().max(20).optional(),
  timezone: z.string().max(80).optional(),
  professionalRole: z.string().max(80).optional(),
  skills: SkillsArray.optional(),
  specialization: z.string().max(160).optional(),
  portfolioLinks: LinksArray.optional(),
  availability: z.enum(["OPEN", "BUSY", "UNAVAILABLE"]).optional(),
  preferredCategories: CatsArray.optional(),
  profileVisibility: z.enum(["PRIVATE", "TEAM", "PUBLIC"]).optional(),
});

export const GET = apiRoute(async () => {
  const userId = await requireUserId();
  const profile = await db.userProfile.findUnique({ where: { userId } });
  return profile;
});

export const PUT = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid profile data", 422, { issues: parsed.error.issues });

  const data = parsed.data;
  const displayName = data.displayName ? sanitizeDisplayName(data.displayName) : undefined;
  if (data.displayName && !displayName) return fail("Invalid display name", 400);

  // Update displayName on User record too.
  if (displayName) {
    await db.user.update({
      where: { id: userId },
      data: { displayName },
    });
  }

  const updated = await db.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      country: data.country ?? null,
      region: data.region ?? null,
      preferredLanguage: data.preferredLanguage ?? "en",
      timezone: data.timezone ?? "Africa/Lagos",
      professionalRole: data.professionalRole ?? null,
      skills: JSON.stringify(data.skills ?? []),
      specialization: data.specialization ?? null,
      portfolioLinks: JSON.stringify(data.portfolioLinks ?? []),
      availability: data.availability ?? "OPEN",
      preferredCategories: JSON.stringify(data.preferredCategories ?? []),
      profileVisibility: data.profileVisibility ?? "PRIVATE",
    },
    update: {
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      country: data.country ?? null,
      region: data.region ?? null,
      preferredLanguage: data.preferredLanguage ?? "en",
      timezone: data.timezone ?? "Africa/Lagos",
      professionalRole: data.professionalRole ?? null,
      skills: data.skills ? JSON.stringify(data.skills) : undefined,
      specialization: data.specialization ?? null,
      portfolioLinks: data.portfolioLinks ? JSON.stringify(data.portfolioLinks) : undefined,
      availability: data.availability ?? "OPEN",
      preferredCategories: data.preferredCategories
        ? JSON.stringify(data.preferredCategories)
        : undefined,
      profileVisibility: data.profileVisibility ?? "PRIVATE",
    },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "profile.updated",
    targetType: "UserProfile",
    targetId: userId,
  });

  return updated;
});
