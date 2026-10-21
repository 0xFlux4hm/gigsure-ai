/**
 * Admin: list / search users across the platform.
 *
 * Supports:
 *   - pagination (?limit=50&offset=0)
 *   - search (?q=email-or-name)
 *   - filter by status (?status=ACTIVE|SUSPENDED|PENDING_DELETION|DELETED)
 *   - filter by role (?role=USER|ADMIN)
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  // SECURITY (2026-10): cap query length to prevent CPU-drain DoS via
  // contains queries with huge `q` values.
  const q = (getQueryParam(req, "q") ?? "").toLowerCase().trim().slice(0, 100);
  const status = getQueryParam(req, "status");
  const role = getQueryParam(req, "role");

  const where: Record<string, unknown> = {};
  if (status) where.accountStatus = status;
  if (role) where.platformRole = role;
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { emailNormalized: { contains: q } },
      { displayName: { contains: q } },
    ];
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
        accountStatus: true,
        platformRole: true,
        lastLoginAt: true,
        createdAt: true,
        deletedAt: true,
        _count: {
          select: {
            projectsOwned: true,
            memberships: true,
            auditEvents: true,
            aiActivities: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.user.count({ where }),
  ]);

  return { users, total, limit, offset };
});
