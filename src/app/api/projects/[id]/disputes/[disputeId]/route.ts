/** Get dispute detail (with evidence + messages). */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";

import { isPlatformAdmin } from "@/lib/auth/admin-access";
export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, disputeId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      opener: { select: { id: true, displayName: true, email: true } },
      milestone: { select: { id: true, title: true } },
      evidence: true,
      messages: { include: { author: { select: { id: true, displayName: true } } } },
      reviews: { include: { reviewer: { select: { id: true, displayName: true } } } },
    },
  });
  if (!dispute || dispute.projectId !== projectId) return fail("Dispute not found", 404);

  // Reviewers can view only disputes assigned to them.
  if (membership?.role === "REVIEWER") {
    const assigned = dispute.reviews.some((r) => r.reviewerId === userId);
    if (!assigned) throw new AuthzError("Dispute not assigned to you", 403);
  }

  return dispute;
});
