/** List & create tasks. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const Schema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).default(""),
  assigneeId: z.string().cuid().nullable().optional(),
  milestoneId: z.string().cuid().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dueDate: z.string().datetime().nullable().optional(),
  dependsOn: z.array(z.string().cuid()).default([]),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const tasks = await db.task.findMany({
    where: { projectId: params.id },
    include: {
      assignee: { select: { id: true, displayName: true, email: true } },
      milestone: { select: { id: true, title: true } },
      deliverables: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return { tasks };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "task:create");

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid task", 422); }

  // Verify assignee is a member if specified.
  if (parsed.data.assigneeId) {
    const m = await db.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.id, userId: parsed.data.assigneeId } },
    });
    if (!m || m.revokedAt) return fail("Assignee is not a project member", 400);
  }

  // SECURITY (2026-10): if milestoneId is supplied, verify it belongs to this
  // project. Otherwise an attacker on project A could create a task in project
  // A but reference project B's milestone — polluting project B's milestone
  // task list and potentially breaking milestone-completion logic.
  if (parsed.data.milestoneId) {
    const m = await db.milestone.findUnique({
      where: { id: parsed.data.milestoneId },
      select: { projectId: true },
    });
    if (!m || m.projectId !== params.id) {
      return fail("Milestone not found in this project", 400);
    }
  }

  const task = await db.task.create({
    data: {
      projectId: params.id,
      title: parsed.data.title,
      description: parsed.data.description,
      assigneeId: parsed.data.assigneeId ?? null,
      milestoneId: parsed.data.milestoneId ?? null,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      dependsOn: JSON.stringify(parsed.data.dependsOn),
      status: "TODO",
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "task.created",
    targetType: "Task",
    targetId: task.id,
    metadata: { title: task.title },
  });
  return task;
});
