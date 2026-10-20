/**
 * Admin: AI activity log across the platform.
 *
 * Used for cost monitoring + abuse detection.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdmin();

  const limit = Math.min(getQueryInt(req, "limit", 100), 500);
  const offset = getQueryInt(req, "offset", 0);
  const assistant = getQueryParam(req, "assistant");
  const userId = getQueryParam(req, "userId");
  const onlyFallback = getQueryParam(req, "fallback") === "true";

  const where: Record<string, unknown> = {};
  if (assistant) where.assistantType = assistant;
  if (userId) where.userId = userId;
  if (onlyFallback) where.fallbackUsed = true;

  const [activities, total, byAssistant, totalTokens, fallbackCount] = await Promise.all([
    db.aiActivity.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.aiActivity.count({ where }),
    db.aiActivity.groupBy({
      by: ["assistantType"],
      _count: { assistantType: true },
      _sum: { tokensUsed: true },
      orderBy: { _count: { assistantType: "desc" } },
      where,
    }),
    db.aiActivity.aggregate({
      _sum: { tokensUsed: true },
      where,
    }),
    db.aiActivity.count({ where: { ...where, fallbackUsed: true } }),
  ]);

  return {
    activities,
    total,
    limit,
    offset,
    aggregates: {
      byAssistant: byAssistant.map((a) => ({
        assistant: a.assistantType,
        count: a._count.assistantType,
        tokensUsed: a._sum.tokensUsed ?? 0,
      })),
      totalTokensUsed: totalTokens._sum.tokensUsed ?? 0,
      fallbackCount,
      fallbackRate: total > 0 ? fallbackCount / total : 0,
    },
  };
});
