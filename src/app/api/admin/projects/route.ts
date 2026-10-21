/**
 * Admin: list all projects across the platform.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  // cap query length
  const q = (getQueryParam(req, "q") ?? "").toLowerCase().trim().slice(0, 100);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { slug: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [projects, total] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        client: { select: { id: true, displayName: true, email: true } },
        _count: {
          select: {
            tasks: true,
            milestones: true,
            contracts: true,
            disputes: true,
            memberships: true,
            fundingRecords: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.project.count({ where }),
  ]);

  return { projects, total, limit, offset };
});
