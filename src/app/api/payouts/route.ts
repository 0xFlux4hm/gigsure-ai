/**
 * List payouts visible to the current user.
 *
 * - Non-admins: see only payouts they received or initiated.
 * - Admins: see all payouts.
 *
 * Query params: ?status=PENDING|SUCCEEDED|FAILED&projectId=xxx&limit=50
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req) => {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);

  // Check if user is admin.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  const isAdmin = user?.platformRole === "ADMIN";

  const where: {
    OR?: Array<{ payeeId?: string; initiatedById?: string }>;
    status?: string;
    projectId?: string;
  } = {};
  if (!isAdmin) {
    where.OR = [{ payeeId: userId }, { initiatedById: userId }];
  }
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;

  const payouts = await db.payout.findMany({
    where,
    orderBy: { initiatedAt: "desc" },
    take: limit,
    include: {
      payee: { select: { id: true, displayName: true, email: true } },
      initiatedBy: { select: { id: true, displayName: true } },
      project: { select: { id: true, title: true } },
      milestone: { select: { id: true, title: true } },
    },
  });

  return {
    payouts: payouts.map((p) => ({
      id: p.id,
      payoutReference: p.payoutReference,
      projectId: p.projectId,
      projectTitle: p.project.title,
      milestoneId: p.milestoneId,
      milestoneTitle: p.milestone?.title,
      payee: p.payee,
      initiatedBy: p.initiatedBy,
      provider: p.provider,
      providerReference: p.providerReference,
      amountMinor: p.amountMinor,
      feeMinor: p.feeMinor,
      netMinor: p.netMinor,
      currency: p.currency,
      payeeAccountName: p.payeeAccountName,
      payeeAccountNumber: p.payeeAccountNumber,
      payeeBankCode: p.payeeBankCode,
      payeeBankName: p.payeeBankName,
      status: p.status,
      failureReason: p.failureReason,
      initiatedAt: p.initiatedAt,
      settledAt: p.settledAt,
      failedAt: p.failedAt,
    })),
  };
});
