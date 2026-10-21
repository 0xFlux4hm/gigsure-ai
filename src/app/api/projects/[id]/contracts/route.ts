/**
 * List & create contract versions.
 *
 * A new version NEVER overwrites the old one. Old versions are marked
 * SUPERSEDED but preserved. Acceptances are recorded per-version-per-user.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const Schema = z.object({
  scopeOfWork: z.string().min(20).max(20000),
  deliverables: z.array(z.string().min(1).max(500)).max(50).default([]),
  deadlines: z.string().max(4000).default(""),
  paymentSchedule: z.string().max(8000).default(""),
  milestoneConditions: z.string().max(4000).default(""),
  revisionRules: z.string().max(4000).default(""),
  cancellationTerms: z.string().max(4000).default(""),
  disputeProcedures: z.string().max(4000).default(""),
});

async function loadMembership(projectId: string, userId: string) {
  const m = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!m || m.revokedAt) throw new AuthzError("Not a member", 403);
  return m;
}

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  await loadMembership(params.id, userId);
  const versions = await db.contractVersion.findMany({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    include: { acceptances: true },
  });
  return { versions };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await loadMembership(params.id, userId);
  assertPermission(membership, "contract:propose");

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid contract data", 422); }

  const last = await db.contractVersion.findFirst({
    where: { projectId: params.id },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, status: true },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;

  // Mark prior ACCEPTED version as superseded (still preserved, not deleted).
  const version = await db.$transaction(async (tx) => {
    if (last && last.status === "ACCEPTED") {
      await tx.contractVersion.update({
        where: { id: last.id },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });
    }
    return tx.contractVersion.create({
      data: {
        projectId: params.id,
        versionNumber,
        scopeOfWork: parsed.data.scopeOfWork,
        deliverables: JSON.stringify(parsed.data.deliverables),
        deadlines: parsed.data.deadlines,
        paymentSchedule: parsed.data.paymentSchedule,
        milestoneConditions: parsed.data.milestoneConditions,
        revisionRules: parsed.data.revisionRules,
        cancellationTerms: parsed.data.cancellationTerms,
        disputeProcedures: parsed.data.disputeProcedures,
        status: "PROPOSED",
        createdById: userId,
      },
    });
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "contract.proposed",
    targetType: "ContractVersion",
    targetId: version.id,
    metadata: { version: versionNumber },
  });
  return version;
});
