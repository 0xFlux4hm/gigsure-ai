/** Get trust badges for the current user. */
import { apiRoute } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getUserTrustBadges } from "@/lib/trust/badges";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  const userId = await requireUserId();
  const badges = await getUserTrustBadges(userId);
  return { badges };
});
