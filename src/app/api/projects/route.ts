/** Project list & creation. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, getQueryInt } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { validateCurrency, amountToMinor, sanitizeDisplayName } from "@/lib/security/validation";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const CreateSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(8000),
  clientId: z.string().cuid().optional().nullable(),
  currency: z.string().max(8).default("NGN"),
  budget: z.number().int().min(0).max(1_000_000_000).default(0),
  fundingArrangement: z.enum(["FULL", "MILESTONE", "UPFRONT_PLUS_MILESTONES"]).default("MILESTONE"),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || "project";
  let i = 0;
  while (await db.project.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${slugify(base)}-${i}`.slice(0, 60);
  }
  return slug;
}

export const GET = apiRoute(async (req) => {
  const userId = await requireUserId();
  const limit = Math.min(getQueryInt(req, "limit", 50), 100);
  const offset = getQueryInt(req, "offset", 0);
  const memberships = await db.projectMembership.findMany({
    where: { userId, revokedAt: null },
    select: { projectId: true, role: true },
  });
  const projectIds = memberships.map((m) => m.projectId);
  const projects = await db.project.findMany({
    where: { id: { in: projectIds }, status: { not: "CANCELLED" } },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      client: { select: { id: true, displayName: true, email: true } },
      _count: { select: { tasks: true, milestones: true, disputes: true, memberships: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    skip: offset,
  });
  return {
    projects: projects.map((p) => ({
      ...p,
      myRole: memberships.find((m) => m.projectId === p.id)?.role,
    })),
  };
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid project data", 422); }

  const data = parsed.data;
  if (!validateCurrency(data.currency)) return fail("Unsupported currency", 400);

  const budgetMinor = (() => {
    try {
      return amountToMinor(data.budget, data.currency);
    } catch {
      return 0;
    }
  })();

  if (data.clientId) {
    const client = await db.user.findUnique({ where: { id: data.clientId } });
    if (!client) return fail("Client not found", 404);
  }

  const slug = await uniqueSlug(data.title);
  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        ownerId: userId,
        clientId: data.clientId ?? null,
        title: sanitizeDisplayName(data.title) ?? "Untitled Project",
        slug,
        description: data.description,
        currency: data.currency.toUpperCase(),
        budgetMinor,
        fundingArrangement: data.fundingArrangement,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: "DRAFT",
      },
    });
    await tx.projectMembership.create({
      data: { projectId: p.id, userId, role: "OWNER" },
    });
    if (data.clientId) {
      await tx.projectMembership.create({
        data: { projectId: p.id, userId: data.clientId, role: "CLIENT" },
      });
    }
    return p;
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: project.id,
    action: "project.created",
    targetType: "Project",
    targetId: project.id,
  });

  return project;
});
