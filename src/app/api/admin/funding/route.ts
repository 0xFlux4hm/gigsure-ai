/**
 * Admin: list all funding records across the platform.
 * Includes failed transactions + webhook delivery status for reconciliation.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdmin();

  const limit = Math.min(getQueryInt(req, "limit", 100), 500);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  const type = getQueryParam(req, "type");
  const provider = getQueryParam(req, "provider");
  const onlySimulated = getQueryParam(req, "simulated");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (provider) where.provider = provider;
  if (onlySimulated === "true") where.isSimulated = true;
  if (onlySimulated === "false") where.isSimulated = false;

  const [records, total, statusCounts, typeCounts] = await Promise.all([
    db.fundingRecord.findMany({
      where,
      include: {
        project: { select: { id: true, title: true, slug: true } },
        milestone: { select: { id: true, title: true } },
        initiatedBy: { select: { id: true, displayName: true, email: true } },
        webhookEvents: {
          select: { id: true, eventType: true, signatureValid: true, processedAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { initiatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.fundingRecord.count({ where }),
    db.fundingRecord.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    db.fundingRecord.groupBy({
      by: ["type"],
      _count: { type: true },
    }),
  ]);

  // Aggregate volume per status
  const volumeByStatus = await db.fundingRecord.groupBy({
    by: ["status"],
    _sum: { amountMinor: true },
  });

  return {
    records,
    total,
    limit,
    offset,
    aggregates: {
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count.status })),
      byType: typeCounts.map((t) => ({ type: t.type, count: t._count.type })),
      volumeByStatus: volumeByStatus.map((v) => ({
        status: v.status,
        totalAmountMinor: v._sum.amountMinor ?? 0,
      })),
    },
  };
});
