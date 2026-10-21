/** Check KYC verification status for the current user. */
import { apiRoute } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getUserKycStatus, checkKycStatus } from "@/lib/kyc/provider";

export const GET = apiRoute(async () => {
  const userId = await requireUserId();
  return await getUserKycStatus(userId);
});
