/** Current authenticated user info (includes KYC status + admin check). */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getUserKycStatus } from "@/lib/kyc/provider";

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
      platformRole: true,
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

  // Include KYC verification status
  const kyc = await getUserKycStatus(userId);

  return {
    ...user,
    kyc: {
      verified: kyc.verified,
      status: kyc.status,
    },
  };
});
