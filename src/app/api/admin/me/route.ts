/**
 * Admin: current admin identity + permission check.
 * Returns the admin's basic info so the frontend can confirm access.
 */
import { apiRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const GET = apiRoute(async () => {
  const admin = await requireAdmin();
  const user = await db.user.findUnique({
    where: { id: admin.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      platformRole: true,
      accountStatus: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return user;
});
