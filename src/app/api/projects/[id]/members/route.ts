/** List project members. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const members = await db.projectMembership.findMany({
    where: { projectId: params.id, revokedAt: null },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          profile: { select: { professionalRole: true, headline: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return { members };
});
