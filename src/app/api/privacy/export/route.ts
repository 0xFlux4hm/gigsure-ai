/**
 * Request a personal-data export. Generates a JSON snapshot of the user's
 * eligible personal information EXCLUDING other users' private data.
 *
 * Returns the export immediately in dev mode. In production, this should be
 * processed asynchronously with a signed, expiring download URL.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";

export const POST = apiRoute(async (_req) => {
  const userId = await requireUserId();
  // Check no existing PENDING/PROCESSING request
  const existing = await db.privacyRequest.findFirst({
    where: { userId, type: "EXPORT", status: { in: ["PENDING", "PROCESSING"] } },
  });
  if (existing) {
    return fail("You already have a pending export request.", 409);
  }

  // In dev mode: generate immediately. In prod: queue.
  const isProd = process.env.NODE_ENV === "production";

  const request = await db.privacyRequest.create({
    data: { userId, type: "EXPORT", status: "PROCESSING" },
  });

  // Collect user data — exclude other users' private fields.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
      accountStatus: true,
      createdAt: true,
      lastLoginAt: true,
      profile: true,
      preferences: true,
      identities: { select: { provider: true, createdAt: true, lastAuthenticatedAt: true } },
      projectsOwned: { select: { id: true, title: true, status: true, createdAt: true } },
      memberships: { select: { projectId: true, role: true, joinedAt: true } },
      tasksAssigned: { select: { id: true, title: true, status: true, dueDate: true } },
      notifications: { select: { id: true, type: true, title: true, createdAt: true } },
      auditEvents: { where: { actorId: userId }, select: { action: true, createdAt: true } },
      privacyRequests: { select: { id: true, type: true, status: true, createdAt: true } },
    },
  });

  if (!user) {
    await db.privacyRequest.update({
      where: { id: request.id },
      data: { status: "DENIED", result: "User not found" },
    });
    return fail("User not found", 404);
  }

  await db.privacyRequest.update({
    where: { id: request.id },
    data: { status: "READY", result: "Generated", completedAt: new Date() },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "privacy.export_generated",
    targetType: "PrivacyRequest",
    targetId: request.id,
  });

  return { exportId: request.id, data: user };
});
