import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";
import { listAvailableProviders, isLivePaymentsEnabled } from "@/lib/payments/registry";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  const provider = getQueryParam(req, "provider");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (provider) where.provider = provider;

  const [transactions, total, statusCounts, providerCounts, feeAgg] = await Promise.all([
    db.paymentTransaction.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, title: true } },
        milestone: { select: { id: true, title: true } },
        ledgerEntries: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.paymentTransaction.count({ where }),
    db.paymentTransaction.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    db.paymentTransaction.groupBy({
      by: ["provider"],
      _count: { provider: true },
    }),
    db.paymentTransaction.aggregate({
      _sum: { amountMinor: true, feeMinor: true, netMinor: true },
      _count: true,
      where,
    }),
  ]);

  return {
    transactions,
    total,
    limit,
    offset,
    aggregates: {
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count.status })),
      byProvider: providerCounts.map((p) => ({ provider: p.provider, count: p._count.provider })),
      totalAmountMinor: feeAgg._sum.amountMinor ?? 0,
      totalFeeMinor: feeAgg._sum.feeMinor ?? 0,
      totalNetMinor: feeAgg._sum.netMinor ?? 0,
      totalCount: feeAgg._count,
    },
    providers: listAvailableProviders(),
    livePaymentsEnabled: isLivePaymentsEnabled(),
    feeRate: process.env.PLATFORM_FEE_BPS ?? "150",
  };
});
