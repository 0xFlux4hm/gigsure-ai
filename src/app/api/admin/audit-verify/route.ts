/**
 * Admin: Verify the audit hash chain integrity.
 * POST /api/admin/audit-verify
 *
 * Recomputes every eventHash from genesis and checks it matches the stored
 * value. Returns the count of broken links (0 = chain is intact).
 */
import { apiRoute } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";
import { verifyAuditChain } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async () => {
  await requireAdminRateLimited();
  const result = await verifyAuditChain();
  return result;
});
