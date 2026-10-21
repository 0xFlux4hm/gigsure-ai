/**
 * Admin payouts dashboard data — list all payouts across all projects.
 *
 * Query params:
 *   ?status=PENDING|SUCCEEDED|FAILED&limit=50&page=1
 *
 * Admin-only endpoint.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req) => {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (user?.platformRole !== "ADMIN") {
    return fail("Admin access required", 403);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10), 1);
  const skip = (page - 1) * limit;

  const where: { status?: string } = {};
  if (status) where.status = status;

  const [payouts, total] = await Promise.all([
    db.payout.findMany({
      where,
      orderBy: { initiatedAt: "desc" },
      take: limit,
      skip,
      include: {
        payee: { select: { id: true, displayName: true, email: true } },
        initiatedBy: { select: { id: true, displayName: true } },
        project: { select: { id: true, title: true } },
        milestone: { select: { id: true, title: true, status: true } },
      },
    }),
    db.payout.count({ where }),
  ]);

  // Aggregate stats
  const stats = await db.payout.groupBy({
    by: ["status"],
    _sum: { amountMinor: true, netMinor: true },
    _count: true,
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
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    stats: stats.map((s) => ({
      status: s.status,
      count: s._count,
      totalAmountMinor: s._sum.amountMinor ?? 0,
      totalNetMinor: s._sum.netMinor ?? 0,
    })),
  };
});
