/** List & create milestones. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const Schema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), // SECURITY: min(1) — zero-value milestones are meaningless and pollute the ledger
  dueDate: z.string().datetime().nullable().optional(),
  orderIndex: z.number().int().min(0).default(0),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const milestones = await db.milestone.findMany({
    where: { projectId: params.id },
    include: {
      tasks: true,
      fundingRecords: true,
    },
    orderBy: { orderIndex: "asc" },
  });
  return { milestones };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "milestone:approve"); // Owner-only

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid milestone", 422); }

  const milestone = await db.milestone.create({
    data: {
      projectId: params.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      amountMinor: parsed.data.amountMinor,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      orderIndex: parsed.data.orderIndex,
      status: "DRAFT",
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "milestone.created",
    targetType: "Milestone",
    targetId: milestone.id,
  });
  return milestone;
});
