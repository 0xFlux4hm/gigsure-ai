/** Current authenticated user info. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const GET = apiRoute(async () => {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
      profile: true,
      preferences: true,
      identities: {
        select: {
          provider: true,
          providerSubject: true,
          lastAuthenticatedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!user) return fail("User not found", 404);
  return user;
});
