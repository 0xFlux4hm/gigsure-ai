/**
 * Admin: list all disputes across the platform.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  const category = getQueryParam(req, "category");
  // SECURITY (2026-10): cap query length
  const q = (getQueryParam(req, "q") ?? "").toLowerCase().trim().slice(0, 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (q) {
    where.OR = [{ title: { contains: q } }, { description: { contains: q } }];
  }

  const [disputes, total] = await Promise.all([
    db.dispute.findMany({
      where,
      include: {
        project: { select: { id: true, title: true, slug: true } },
        opener: { select: { id: true, displayName: true, email: true } },
        milestone: { select: { id: true, title: true, status: true } },
        reviews: {
          include: { reviewer: { select: { id: true, displayName: true, email: true } } },
        },
        _count: { select: { evidence: true, messages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.dispute.count({ where }),
  ]);

  return { disputes, total, limit, offset };
});
