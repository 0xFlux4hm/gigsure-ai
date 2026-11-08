/**
 * Change a member's role (PATCH) and remove a member (DELETE).
 *
 * PATCH  /api/projects/[id]/members/[memberId]  { role: "COLLABORATOR" | "TEAM_LEAD" | "REVIEWER" }
 * DELETE /api/projects/[id]/members/[memberId]
 *
 * Authorization:
 * - PATCH (role change): requires `project:manage_team` (OWNER + TEAM_LEAD)
 * - DELETE (remove member): requires `project:manage_team` (OWNER + TEAM_LEAD)
 *
 * Rules:
 * - Cannot change your own role (prevents self-lockout)
 * - Cannot change an OWNER's role (OWNER is immutable)
 * - Cannot remove an OWNER (the project owner cannot be removed)
 * - Cannot remove yourself (use project deletion instead)
 * - When removing, the membership is soft-deleted (revokedAt = now)
 *   so financial/audit records are preserved
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { notifyUser } from "@/lib/notifications";
import { z } from "zod";

const RoleSchema = z.object({
  role: z.enum(["COLLABORATOR", "TEAM_LEAD", "REVIEWER"]),
});

// ── CHANGE ROLE ──
export const PATCH = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, memberId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "project:manage_team");

  const body = await parseJsonBody<unknown>(req);
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid role", 422);
  }

  // Find the target membership by membership ID (not user ID)
  const target = await db.projectMembership.findUnique({ where: { id: memberId } });
  if (!target || target.projectId !== projectId) {
    return fail("Member not found", 404);
  }
  if (target.revokedAt) return fail("Member has already been removed", 400);
  if (target.role === "OWNER") return fail("Cannot change the project owner's role", 400);
  if (target.userId === userId) return fail("You cannot change your own role", 400);

  const oldRole = target.role;
  if (oldRole === parsed.data.role) {
    return fail(`Member is already a ${oldRole.toLowerCase()}`, 400);
  }

  await db.projectMembership.update({
    where: { id: memberId },
    data: { role: parsed.data.role },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "member.role_changed",
    targetType: "ProjectMembership",
    targetId: memberId,
    metadata: { from: oldRole, to: parsed.data.role },
  });

  // Notify the member whose role changed
  await notifyUser({
    userId: target.userId,
    projectId,
    type: "MEMBER_ROLE_CHANGED",
    title: "Your role changed",
    body: `Your role on this project changed from ${oldRole.toLowerCase()} to ${parsed.data.role.toLowerCase()}.`,
  }).catch(() => {});

  return { updated: true, role: parsed.data.role };
});

// ── REMOVE MEMBER ──
export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, memberId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "project:manage_team");

  const target = await db.projectMembership.findUnique({ where: { id: memberId } });
  if (!target || target.projectId !== projectId) {
    return fail("Member not found", 404);
  }
  if (target.revokedAt) return fail("Member has already been removed", 400);
  if (target.role === "OWNER") return fail("Cannot remove the project owner", 400);
  if (target.userId === userId) return fail("You cannot remove yourself from the project", 400);

  // Soft-delete: set revokedAt (preserves audit/financial records)
  await db.projectMembership.update({
    where: { id: memberId },
    data: { revokedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "member.removed",
    targetType: "ProjectMembership",
    targetId: memberId,
    metadata: { role: target.role },
  });

  // Notify the removed member
  const projectTitle = (await db.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  }))?.title ?? "a project";
  await notifyUser({
    userId: target.userId,
    projectId,
    type: "MEMBER_REMOVED",
    title: `Removed from "${projectTitle}"`,
    body: `You have been removed from the project. You no longer have access.`,
  }).catch(() => {});

  return { removed: true };
});
