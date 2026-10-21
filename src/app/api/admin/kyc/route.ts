/**
 * Admin: KYC verifications across the platform.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  const provider = getQueryParam(req, "provider");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (provider) where.provider = provider;

  const [verifications, total, statusCounts] = await Promise.all([
    db.kycVerification.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.kycVerification.count({ where }),
    db.kycVerification.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  return {
    verifications,
    total,
    limit,
    offset,
    aggregates: {
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count.status })),
    },
  };
});
