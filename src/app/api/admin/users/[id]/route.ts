/**
 * Admin: modify a single user.
 *
 * Actions:
 *   - PATCH { action: "suspend" } -> accountStatus = SUSPENDED
 *   - PATCH { action: "activate" } -> accountStatus = ACTIVE
 *   - PATCH { action: "promote_admin" } -> platformRole = ADMIN
 *   - PATCH { action: "demote_admin" } -> platformRole = USER
 *
 * All actions are audited. Self-demotion is blocked to prevent
 * accidentally locking yourself out.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(["suspend", "activate", "promote_admin", "demote_admin"]),
  reason: z.string().max(500).optional(),
});

export const PATCH = apiRoute(async (req, { params }) => {
  const admin = await requireAdmin();
  const targetId = params.id;

  // Look up the target user
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, displayName: true, accountStatus: true, platformRole: true },
  });
  if (!target) return fail("User not found", 404);

  const body = await parseJsonBody<unknown>(req);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid action", 422, { issues: parsed.error.issues });

  const data = parsed.data;

  // Prevent self-demotion / self-suspension
  if (admin.userId === target.id && (data.action === "demote_admin" || data.action === "suspend")) {
    return fail("You cannot perform this action on your own account.", 400);
  }

  let update: Record<string, unknown> = {};
  let auditAction: string = "";
  switch (data.action) {
    case "suspend":
      update = { accountStatus: "SUSPENDED" };
      auditAction = "admin.user_suspended";
      break;
    case "activate":
      update = { accountStatus: "ACTIVE" };
      auditAction = "admin.user_activated";
      break;
    case "promote_admin":
      update = { platformRole: "ADMIN" };
      auditAction = "admin.user_promoted";
      break;
    case "demote_admin":
      update = { platformRole: "USER" };
      auditAction = "admin.user_demoted";
      break;
  }

  await db.user.update({
    where: { id: target.id },
    data: update,
  });

  logSecurityEvent("warn", auditAction, {
    adminId: admin.userId,
    targetId: target.id,
    targetEmail: target.email,
    reason: data.reason,
  });

  await recordAuditEvent({
    actorId: admin.userId,
    action: auditAction,
    targetType: "User",
    targetId: target.id,
    metadata: {
      targetEmail: target.email,
      reason: data.reason,
      before: {
        accountStatus: target.accountStatus,
        platformRole: target.platformRole,
      },
      after: update,
    },
  });

  // Notify the target user (except when promoting to admin — that's a silent grant)
  if (data.action === "suspend" || data.action === "activate") {
    await db.notification.create({
      data: {
        userId: target.id,
        type: "SECURITY",
        title: data.action === "suspend" ? "Account suspended" : "Account reactivated",
        body:
          data.action === "suspend"
            ? `Your account has been suspended by an administrator. Reason: ${data.reason ?? "not specified"}. Contact support if you believe this is an error.`
            : "Your account has been reactivated. You can sign in again.",
      },
    });
  }

  return {
    ok: true,
    target: { id: target.id, email: target.email, displayName: target.displayName },
    action: data.action,
    changes: update,
  };
});
