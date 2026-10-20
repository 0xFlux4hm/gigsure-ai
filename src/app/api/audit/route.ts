/** Audit log query for current user. */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  const userId = await requireUserId();
  const limit = Math.min(getQueryInt(req, "limit", 100), 200);
  const offset = getQueryInt(req, "offset", 0);
  const events = await db.auditEvent.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  return { events };
});
