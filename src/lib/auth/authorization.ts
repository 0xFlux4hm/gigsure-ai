/**
 * Server-side authorization primitives.
 *
 * All sensitive endpoints MUST:
 *   1. authenticate the user
 *   2. load the requested resource
 *   3. verify ownership / membership
 *   4. check role-specific permission
 *   5. validate the requested state transition
 *   6. apply the operation transactionally
 *   7. record an audit event
 *
 * This module centralises step 4 (role/permission check) and provides typed
 * errors that the API layer can translate into safe HTTP responses.
 */
import type { ProjectMembership } from "@prisma/client";

export type ProjectRole =
  | "OWNER"
  | "CLIENT"
  | "COLLABORATOR"
  | "TEAM_LEAD"
  | "REVIEWER";

export type PlatformRole = "USER" | "ADMIN";

export type Permission =
  | "project:view"
  | "project:edit"
  | "project:delete"
  | "project:invite"
  | "project:manage_team"
  | "contract:propose"
  | "contract:accept"
  | "task:create"
  | "task:assign"
  | "task:submit"
  | "task:review"
  | "compensation:propose"
  | "compensation:accept"
  | "milestone:approve"
  | "milestone:release"
  | "funding:initiate"
  | "dispute:open"
  | "dispute:respond"
  | "dispute:review"
  | "ai:invoke"
  | "privacy:export"
  | "privacy:delete";

const ROLE_PERMISSIONS: Record<ProjectRole, Permission[]> = {
  OWNER: [
    "project:view",
    "project:edit",
    "project:delete",
    "project:invite",
    "project:manage_team",
    "contract:propose",
    "contract:accept",
    "task:create",
    "task:assign",
    "task:submit",
    "task:review",
    "compensation:propose",
    "compensation:accept",
    "milestone:approve",
    "milestone:release",
    "funding:initiate",
    "dispute:open",
    "dispute:respond",
    "ai:invoke",
  ],
  CLIENT: [
    "project:view",
    "contract:accept",
    "milestone:approve",
    "dispute:open",
    "dispute:respond",
    "ai:invoke",
  ],
  COLLABORATOR: [
    "project:view",
    "task:submit",
    "compensation:accept",
    "dispute:open",
    "dispute:respond",
    "ai:invoke",
  ],
  TEAM_LEAD: [
    "project:view",
    "task:create",
    "task:assign",
    "task:review",
    "project:manage_team",
    "ai:invoke",
  ],
  REVIEWER: [
    "dispute:review",
    "ai:invoke",
  ],
};

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

export class AuthnError extends Error {
  status: number;
  constructor(message = "Authentication required", status = 401) {
    super(message);
    this.name = "AuthnError";
    this.status = status;
  }
}

export function hasPermission(role: ProjectRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function assertPermission(
  membership: ProjectMembership | null,
  perm: Permission,
): void {
  if (!membership) throw new AuthzError("Not a member of this project", 403);
  if (membership.revokedAt) throw new AuthzError("Membership revoked", 403);
  if (!hasPermission(membership.role as ProjectRole, perm)) {
    throw new AuthzError(`Your role does not permit: ${perm}`, 403);
  }
}

/** Tasks: only the assignee (or OWNER) may submit deliverables. */
export function canSubmitTask(
  membership: ProjectMembership,
  assigneeId: string | null,
): boolean {
  if (hasPermission(membership.role as ProjectRole, "task:review")) return true;
  return assigneeId === membership.userId;
}

/** Compensation: a collaborator may accept only their own allocation. */
export function canAcceptCompensation(
  membership: ProjectMembership,
  allocationUserId: string,
): boolean {
  if (hasPermission(membership.role as ProjectRole, "compensation:propose")) return true;
  return membership.userId === allocationUserId;
}
