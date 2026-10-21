/** Poll the status of a specific KYC verification. */
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkKycStatus } from "@/lib/kyc/provider";

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const verificationId = params.verificationId;
  if (!verificationId) return fail("Verification ID required", 400);
  return await checkKycStatus(verificationId, userId);
});
