/** Mark a notification as read. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const n = await db.notification.findUnique({ where: { id: params.id } });
  if (!n || n.userId !== userId) return fail("Notification not found", 404);
  if (n.readAt) return { alreadyRead: true };
  await db.notification.update({
    where: { id: params.id },
    data: { readAt: new Date() },
  });
  return { read: true };
});
