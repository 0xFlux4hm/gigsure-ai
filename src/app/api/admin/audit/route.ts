import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 100), 500);
  const offset = getQueryInt(req, "offset", 0);
  const actorId = getQueryParam(req, "actorId");
  const projectId = getQueryParam(req, "projectId");
  const actionPrefix = getQueryParam(req, "action");
  const startDate = getQueryParam(req, "start");
  const endDate = getQueryParam(req, "end");

  const where: Record<string, unknown> = {};
  if (actorId) where.actorId = actorId;
  if (projectId) where.projectId = projectId;
  if (actionPrefix) where.action = { contains: actionPrefix };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      include: {
        actor: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.auditEvent.count({ where }),
  ]);

  // Top actions in the result set
  const actionCounts = await db.auditEvent.groupBy({
    by: ["action"],
    _count: { action: true },
    orderBy: { _count: { action: "desc" } },
    take: 15,
    where,
  });

  return { events, total, limit, offset, topActions: actionCounts };
});
