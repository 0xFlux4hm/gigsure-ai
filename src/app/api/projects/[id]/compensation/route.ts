/**
 * Compensation agreements.
 *
 * Invariants:
 *   - Total allocations (if budget rule applies) must equal totalDistributableMinor.
 *   - Each new version supersedes the previous one; acceptances reset per version.
 *   - A collaborator may accept only their own allocation.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { validateCurrency, amountToMinor, minorToAmount } from "@/lib/security/validation";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
const AllocationSchema = z.object({
  userId: z.string().cuid(),
  role: z.string().max(80),
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  percentageBps: z.number().int().min(0).max(10000),
  notes: z.string().max(400).optional(),
});

const Schema = z.object({
  totalDistributable: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().max(8).default("NGN"),
  allocations: z.array(AllocationSchema).min(1).max(50),
  enforceTotalMatch: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  // HACKATHON FIX (Oct 29, 2026): platform admins get read access for oversight
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  const agreements = await db.compensationAgreement.findMany({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    include: { allocations: true, acceptances: true },
  });
  return { agreements };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "compensation:propose");

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid compensation data", 422); }

  const data = parsed.data;
  if (!validateCurrency(data.currency)) return fail("Unsupported currency", 400);
  const totalMinor = amountToMinor(data.totalDistributable, data.currency);
  const sum = data.allocations.reduce((s, a) => s + a.amountMinor, 0);
  // always enforce total match — previously `enforceTotalMatch: false`
  // allowed allocations sum != total, creating logically inconsistent agreements
  // where collaborators were promised more than the project budget.
  if (sum !== totalMinor) {
    return fail(
      `Allocations sum (${sum}) does not match total distributable (${totalMinor})`,
      400,
    );
  }
  // Also enforce percentageBps sum ≤ 10000 (100%)
  const pctSum = data.allocations.reduce((s, a) => s + a.percentageBps, 0);
  if (pctSum > 10000) {
    return fail(
      `Allocations percentage sum (${pctSum} bps) exceeds 10000 bps (100%)`,
      400,
    );
  }

  // Validate allocation users are project members.
  const memberIds = new Set(
    (await db.projectMembership.findMany({
      where: { projectId: params.id, revokedAt: null },
      select: { userId: true },
    })).map((m) => m.userId),
  );
  for (const a of data.allocations) {
    if (!memberIds.has(a.userId)) {
      return fail("All allocation recipients must be project members", 400);
    }
  }

  const last = await db.compensationAgreement.findFirst({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, status: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  const agreement = await db.$transaction(async (tx) => {
    if (last && last.status === "ACCEPTED") {
      await tx.compensationAgreement.update({
        where: { id: last.id },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });
    }
    const agg = await tx.compensationAgreement.create({
      data: {
        projectId: params.id,
        versionNumber,
        totalDistributableMinor: totalMinor,
        currency: data.currency.toUpperCase(),
        status: "PROPOSED",
        notes: data.notes ?? null,
        createdById: userId,
        allocations: {
          create: data.allocations.map((a) => ({
            userId: a.userId,
            role: a.role,
            amountMinor: a.amountMinor,
            percentageBps: a.percentageBps,
            notes: a.notes ?? null,
          })),
        },
      },
      include: { allocations: true },
    });
    return agg;
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "compensation.proposed",
    targetType: "CompensationAgreement",
    targetId: agreement.id,
    metadata: { version: versionNumber, totalMinor, allocations: data.allocations.length },
  });
  return { ...agreement, totalDistributable: minorToAmount(totalMinor, data.currency) };
});
