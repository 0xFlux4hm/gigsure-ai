/**
 * List and create project feedback (peer reviews).
 *
 * GET  /api/projects/[id]/feedback           — list all public feedback for this project
 * POST /api/projects/[id]/feedback           — submit a review for another user
 *   Body: { revieweeId, rating (1-5), wouldRecommend, onTime?, onBudget?, communication?, quality?, comment? }
 *
 * Rules:
 *   - Project must be COMPLETED (or at least one milestone RELEASED)
 *   - Reviewer must be a project member
 *   - Cannot review yourself
 *   - One review per (reviewer, reviewee, project) — enforced by DB unique constraint
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { notifyUser } from "@/lib/notifications";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/admin-access";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  revieweeId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  wouldRecommend: z.boolean().default(true),
  onTime: z.number().int().min(1).max(5).optional(),
  onBudget: z.number().int().min(1).max(5).optional(),
  communication: z.number().int().min(1).max(5).optional(),
  quality: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  // HACKATHON FIX (Oct 29, 2026): platform admins get read access for oversight
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  const feedback = await db.projectFeedback.findMany({
    where: { projectId: params.id, isPublic: true },
    orderBy: { createdAt: "desc" },
    include: {
      reviewer: { select: { id: true, displayName: true } },
      reviewee: { select: { id: true, displayName: true } },
    },
  });

  return { feedback };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const projectId = params.id;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  // Check project is completed or has at least one released milestone
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) return fail("Project not found", 404);

  const releasedMilestones = await db.milestone.count({
    where: { projectId, status: "RELEASED" },
  });
  if (project.status !== "COMPLETED" && releasedMilestones === 0) {
    return fail(
      "Feedback can only be submitted after at least one milestone is released or the project is completed.",
      400,
    );
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid feedback data", 422);

  const { revieweeId, rating, wouldRecommend, onTime, onBudget, communication, quality, comment } = parsed.data;

  if (revieweeId === userId) {
    return fail("You cannot review yourself", 400);
  }

  // Verify reviewee is a member of the project
  const revieweeMembership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: revieweeId } },
  });
  if (!revieweeMembership || revieweeMembership.revokedAt) {
    return fail("The person you're reviewing is not a member of this project", 400);
  }

  try {
    const feedback = await db.projectFeedback.create({
      data: {
        projectId,
        reviewerId: userId,
        revieweeId,
        rating,
        wouldRecommend,
        onTime,
        onBudget,
        communication,
        quality,
        comment,
      },
    });

    await recordAuditEvent({
      actorId: userId,
      projectId,
      action: "feedback.created",
      targetType: "ProjectFeedback",
      targetId: feedback.id,
      metadata: { revieweeId, rating },
    });

    // Notify the reviewee
    await notifyUser({
      userId: revieweeId,
      projectId,
      type: "GENERAL",
      title: "You received a review",
      body: `You received a ${rating}-star review on this project.`,
    });

    return { feedback, message: "Review submitted. Thank you!" };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return fail("You have already reviewed this person on this project", 409);
    }
    throw err;
  }
});
