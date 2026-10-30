import { db } from "@/lib/db";
import type { Project, ProjectMembership } from "@prisma/client";

export interface ProjectAccessResult {
  project: Project | null;
  membership: ProjectMembership | null;
  isAdmin: boolean;
}

/**
 * Load a project + the user's membership (if any), and also check whether the
 * user is a platform admin. Returns all three so the route handler can decide:
 *
 *   - If !project → 404
 *   - If !membership && !isAdmin → 403 (not a member, not an admin)
 *   - If membership.revokedAt → 403 (membership was revoked)
 *   - Else: grant access (admin OR active member)
 *
 * Admins get an implicit "ADMIN" role for read purposes; the myRole field
 * returned to the client reflects this so the UI can show "Admin" badge.
 */
export async function loadProjectForUser(
  projectId: string,
  userId: string,
): Promise<ProjectAccessResult> {
  const [project, membership, user] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      include: {
        memberships: { where: { userId } },
      },
    }),
    Promise.resolve(null), // placeholder, will be filled below
    db.user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    }),
  ]);

  // The memberships array is on `project`, extract it
  const m = project?.memberships?.[0] ?? null;

  // Strip the memberships array from the returned project so callers don't
  // accidentally rely on it (it's only for the user making the request).
  if (project) {
    // @ts-expect-error — Prisma includes `memberships` from the query above; we want to remove it
    delete project.memberships;
  }

  const isAdminByDb = user?.platformRole === "ADMIN";
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Only fetch user email if env var is set (avoid an extra query in the common case)
  let isAdminByEnv = false;
  if (adminEmails.length > 0 && user) {
    const userWithEmail = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    isAdminByEnv = !!userWithEmail && adminEmails.includes(userWithEmail.email.toLowerCase());
  }
  const isAdmin = isAdminByDb || isAdminByEnv;

  return {
    project: project as Project | null,
    membership: m,
    isAdmin,
  };
}

/**
 * Returns true if the user is a platform admin (DB role OR env-var whitelist).
 * Use this as a lightweight check (no project load) for endpoints like
 * /api/admin/* or for "is the current user an admin" guards in middleware.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, email: true },
  });
  if (!user) return false;
  if (user.platformRole === "ADMIN") return true;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(user.email.toLowerCase());
}
