/**
 * Approve (or request changes on) a milestone.
 *
 * Allowed transitions:
 *   SUBMITTED → APPROVED | CHANGES_REQUESTED
 *
 * Once APPROVED, milestone becomes eligible for release (funding RELEASE
 * initiated via /funding endpoint).
 *
 * Disputes: if a dispute is OPEN on this milestone, the normal approval flow
 * is BLOCKED — see invariant #6 in spec section 28.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  note: z.string().max(1000).optional(),
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, milestoneId } = params;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "milestone:approve");

  const milestone = await db.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone || milestone.projectId !== projectId) {
    return fail("Milestone not found", 404);
  }
  if (milestone.status !== "SUBMITTED") {
    return fail(`Milestone must be SUBMITTED to approve (current: ${milestone.status})`, 400);
  }

  // BLOCKED while dispute is open
  const openDispute = await db.dispute.findFirst({
    where: { milestoneId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
    select: { id: true },
  });
  if (openDispute) {
    return fail(
      "Milestone cannot be approved while an active dispute is open on it.",
      409,
    );
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid decision", 422);

  const newStatus = parsed.data.decision;
  await db.milestone.update({
    where: { id: milestoneId },
    data: { status: newStatus },
  });
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: `milestone.${newStatus.toLowerCase()}`,
    targetType: "Milestone",
    targetId: milestoneId,
    metadata: { note: parsed.data.note },
  });

  // Notify project members about the approval/changes-requested
  const { notifyProjectMembers } = await import("@/lib/notifications");
  if (newStatus === "APPROVED") {
    await notifyProjectMembers(projectId, userId, {
      type: "MILESTONE_APPROVED",
      title: "Milestone approved",
      body: `"${milestone.title}" has been approved. The client can now release the funds.`,
    });
  } else if (newStatus === "CHANGES_REQUESTED") {
    await notifyProjectMembers(projectId, userId, {
      type: "MILESTONE_CHANGES_REQUESTED",
      title: "Changes requested",
      body: `Changes have been requested for "${milestone.title}".${parsed.data.note ? ` Note: ${parsed.data.note}` : ""}`,
    });
  }

  return { status: newStatus };
});
