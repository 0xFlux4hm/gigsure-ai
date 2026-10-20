/** List notifications + mark-as-read. */
import { db } from "@/lib/db";
import { apiRoute, fail, getQueryInt } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  const userId = await requireUserId();
  const limit = Math.min(getQueryInt(req, "limit", 50), 100);
  const offset = getQueryInt(req, "offset", 0);
  const unreadOnly = req.url.includes("unread=1");
  const notifications = await db.notification.findMany({
    where: { userId, readAt: unreadOnly ? null : undefined },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  const unreadCount = await db.notification.count({
    where: { userId, readAt: null },
  });
  return { notifications, unreadCount };
});
