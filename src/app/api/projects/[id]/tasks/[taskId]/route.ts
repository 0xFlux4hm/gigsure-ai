/**
 * Update a task — primarily status transitions.
 *
 * Allowed transitions:
 *   TODO → IN_PROGRESS
 *   IN_PROGRESS → SUBMITTED
 *   SUBMITTED → APPROVED | CHANGES_REQUESTED
 *   CHANGES_REQUESTED → SUBMITTED
 *   APPROVED → (terminal, no further transitions except CANCELLED)
 *
 * Authorization:
 *   - task:submit: assignee or owner (submit / start)
 *   - task:review: owner or team lead (approve / request changes)
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError, canSubmitTask } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const TRANSITIONS: Record<string, Set<string>> = {
  TODO: new Set(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: new Set(["SUBMITTED", "TODO", "CANCELLED"]),
  SUBMITTED: new Set(["CHANGES_REQUESTED", "APPROVED", "IN_PROGRESS", "CANCELLED"]),
  CHANGES_REQUESTED: new Set(["SUBMITTED", "CANCELLED"]),
  APPROVED: new Set(["CANCELLED"]),
  CANCELLED: new Set(),
};

const Schema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "CANCELLED"]).optional(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(4000).optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const PATCH = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, taskId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) return fail("Task not found", 404);

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid update", 422); }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  // SECURITY (2026-10): Editing task metadata (title, description, priority,
  // dueDate) requires `task:create` permission (OWNER or TEAM_LEAD only).
  // Without this check, any member — including CLIENT with no task perms —
  // could vandalize task fields.
  const isEditingFields = ["title", "description", "priority", "dueDate"].some(
    (k) => k in (parsed.data as Record<string, unknown>),
  );
  if (isEditingFields) {
    assertPermission(membership, "task:create");
  }
  if (data.title) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.priority) update.priority = data.priority;
  if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.assigneeId !== undefined) {
    if (data.assigneeId) {
      const m = await db.projectMembership.findUnique({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
      });
      if (!m || m.revokedAt) return fail("Assignee is not a project member", 400);
    }
    update.assigneeId = data.assigneeId;
    assertPermission(membership, "task:assign");
  }

  if (data.status && data.status !== task.status) {
    if (!TRANSITIONS[task.status]?.has(data.status)) {
      return fail(`Cannot transition from ${task.status} to ${data.status}`, 400);
    }
    // SECURITY (2026-10): Transitions to APPROVED/CHANGES_REQUESTED require
    // task:review (OWNER or TEAM_LEAD). CANCELLED from terminal states also
    // requires task:review — only project owners can cancel tasks.
    const isReviewAction = ["APPROVED", "CHANGES_REQUESTED", "CANCELLED"].includes(data.status);
    const isSubmitAction = data.status === "SUBMITTED";
    const isStartAction = data.status === "IN_PROGRESS";
    if (isReviewAction) {
      assertPermission(membership, "task:review");
    } else if (isSubmitAction) {
      if (!canSubmitTask(membership, task.assigneeId)) {
        throw new AuthzError("Only the assignee or project owner may submit this task", 403);
      }
    } else if (isStartAction && task.assigneeId !== userId) {
      if (!canSubmitTask(membership, task.assigneeId)) {
        throw new AuthzError("Only the assignee may start this task", 403);
      }
    }
    update.status = data.status;
  }

  const updated = await db.task.update({ where: { id: taskId }, data: update });
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "task.updated",
    targetType: "Task",
    targetId: taskId,
    metadata: { fields: Object.keys(update), from: task.status, to: data.status },
  });
  return updated;
});
