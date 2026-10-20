/**
 * Admin: privacy request queue.
 *
 * Lists all data-export and account-deletion requests.
 * Admins can mark them as completed / denied.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const GET = apiRoute(async (req) => {
  await requireAdmin();

  const limit = Math.min(getQueryInt(req, "limit", 50), 200);
  const offset = getQueryInt(req, "offset", 0);
  const status = getQueryParam(req, "status");
  const type = getQueryParam(req, "type");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;

  const [requests, total] = await Promise.all([
    db.privacyRequest.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, email: true, accountStatus: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.privacyRequest.count({ where }),
  ]);

  return { requests, total, limit, offset };
});

const UpdateSchema = z.object({
  status: z.enum(["PROCESSING", "READY", "COMPLETED", "DENIED"]),
  result: z.string().max(2000).optional(),
});

/**
 * Update a privacy request's status (admin only).
 */
export const PATCH = apiRoute(async (req, { params }) => {
  // Next.js passes the rest of the path after /api/admin/privacy-requests as `params`.
  // For this route we expect a top-level PATCH with a body containing `requestId`.
  // Since we are at the collection root, accept requestId in the body.
  const admin = await requireAdmin();

  const body = await parseJsonBody<{ requestId?: string } & z.infer<typeof UpdateSchema>>(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid update", 422, { issues: parsed.error.issues });
  if (!body.requestId) return fail("requestId required", 422);

  const existing = await db.privacyRequest.findUnique({
    where: { id: body.requestId },
    include: { user: { select: { id: true, displayName: true, email: true } } },
  });
  if (!existing) return fail("Privacy request not found", 404);

  const updated = await db.privacyRequest.update({
    where: { id: body.requestId },
    data: {
      status: parsed.data.status,
      result: parsed.data.result ?? existing.result,
      completedAt: ["READY", "COMPLETED", "DENIED"].includes(parsed.data.status) ? new Date() : existing.completedAt,
    },
  });

  await recordAuditEvent({
    actorId: admin.userId,
    action: "admin.privacy_request_updated",
    targetType: "PrivacyRequest",
    targetId: body.requestId,
    metadata: {
      targetUserEmail: existing.user.email,
      type: existing.type,
      before: existing.status,
      after: parsed.data.status,
    },
  });

  // Notify the user
  await db.notification.create({
    data: {
      userId: existing.userId,
      type: "PRIVACY",
      title: `Privacy request ${parsed.data.status.toLowerCase()}`,
      body:
        parsed.data.status === "DENIED"
          ? `Your ${existing.type.toLowerCase()} request was denied. Reason: ${parsed.data.result ?? "not specified"}. Contact support if you believe this is an error.`
          : `Your ${existing.type.toLowerCase()} request has been ${parsed.data.status.toLowerCase()}.`,
    },
  });

  return updated;
});
