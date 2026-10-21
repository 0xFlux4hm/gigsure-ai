/** Get / update / delete a single project. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { validateCurrency, amountToMinor } from "@/lib/security/validation";
import { z } from "zod";

const UpdateSchema = z.object({
  title: z.string().min(3).max(160).optional(),
  description: z.string().min(10).max(8000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  currency: z.string().max(8).optional(),
  budget: z.number().int().min(0).max(1_000_000_000).optional(),
  fundingArrangement: z.enum(["FULL", "MILESTONE", "UPFRONT_PLUS_MILESTONES"]).optional(),
});

async function loadProjectAndMembership(projectId: string, userId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      memberships: { where: { userId } },
      owner: { select: { id: true, displayName: true, email: true } },
      client: { select: { id: true, displayName: true, email: true } },
      _count: {
        select: {
          tasks: true,
          milestones: true,
          contracts: true,
          disputes: true,
          memberships: true,
        },
      },
    },
  });
  if (!project) return fail("Project not found", 404);
  const membership = project.memberships[0] ?? null;
  return { project, membership };
}

export const GET = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { project, membership } = await loadProjectAndMembership(params.id, userId);
  if (!membership) throw new AuthzError("Not a member of this project", 403);
  if (membership.revokedAt) throw new AuthzError("Membership revoked", 403);

  const contracts = await db.contractVersion.findMany({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    take: 10,
  });
  const compensation = await db.compensationAgreement.findFirst({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    include: { allocations: true, acceptances: true },
  });

  return {
    ...project,
    myRole: membership.role,
    recentContracts: contracts,
    latestCompensation: compensation,
  };
});

export const PATCH = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { project, membership } = await loadProjectAndMembership(params.id, userId);
  if (!membership) throw new AuthzError("Not a member of this project", 403);
  assertPermission(membership, "project:edit");

  const body = await parseJsonBody<unknown>(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid update", 422);

  const data = parsed.data;
  if (data.currency && !validateCurrency(data.currency)) return fail("Unsupported currency", 400);
  // setting status to CANCELLED is equivalent to deletion
  // and must require project:delete (defense in depth — currently both
  // permissions are OWNER-only, but if a future role gets project:edit
  // without project:delete, they shouldn't be able to cancel projects).
  if (data.status === "CANCELLED") {
    assertPermission(membership, "project:delete");
  }
  const update: Record<string, unknown> = {};
  if (data.title) update.title = data.title;
  if (data.description) update.description = data.description;
  if (data.status) update.status = data.status;
  if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.currency) update.currency = data.currency.toUpperCase();
  if (data.budget !== undefined) {
    update.budgetMinor = amountToMinor(data.budget, data.currency ?? project.currency);
  }
  if (data.fundingArrangement) update.fundingArrangement = data.fundingArrangement;

  const updated = await db.project.update({ where: { id: params.id }, data: update });
  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "project.updated",
    targetType: "Project",
    targetId: params.id,
    metadata: { fields: Object.keys(update) },
  });
  return updated;
});

export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { membership } = await loadProjectAndMembership(params.id, userId);
  if (!membership) throw new AuthzError("Not a member of this project", 403);
  assertPermission(membership, "project:delete");
  await db.project.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });
  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "project.cancelled",
    targetType: "Project",
    targetId: params.id,
  });
  return { cancelled: true };
});
