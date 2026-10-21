/** List & create disputes. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { logSecurityEvent } from "@/lib/auth/audit";
const Schema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  category: z.enum(["QUALITY", "DEADLINE", "PAYMENT", "SCOPE", "CONDUCT", "OTHER"]),
  milestoneId: z.string().cuid().optional(),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  // Reviewers see only disputes assigned to them.
  const where =
    membership.role === "REVIEWER"
      ? { projectId: params.id, reviews: { some: { reviewerId: userId } } }
      : { projectId: params.id };

  const disputes = await db.dispute.findMany({
    where,
    include: {
      opener: { select: { id: true, displayName: true, email: true } },
      milestone: { select: { id: true, title: true } },
      reviews: { include: { reviewer: { select: { id: true, displayName: true } } } },
      _count: { select: { evidence: true, messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return { disputes };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  // SECURITY (2026-10): REVIEWER role has only `dispute:review` — they cannot
  // open disputes. TEAM_LEAD has no `dispute:open` either.
  assertPermission(membership, "dispute:open");

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid dispute", 422); }

  // SECURITY (2026-10): if milestoneId is supplied, verify it belongs to this
  // project. Otherwise an attacker could open a dispute on project A that
  // references project B's milestone, then mutate project B's milestone
  // status to DISPUTED (blocking its funding/release flow).
  if (parsed.data.milestoneId) {
    const milestone = await db.milestone.findUnique({
      where: { id: parsed.data.milestoneId },
      select: { id: true, status: true, projectId: true },
    });
    if (!milestone || milestone.projectId !== params.id) {
      return fail("Milestone not found in this project", 404);
    }
  }

  // Wrap dispute-create + milestone-update in a single transaction so we
  // never end up with a dispute referencing a milestone that wasn't blocked.
  const dispute = await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({
      data: {
        projectId: params.id,
        openedById: userId,
        milestoneId: parsed.data.milestoneId ?? null,
        category: parsed.data.category,
        title: parsed.data.title,
        description: parsed.data.description,
        status: "OPEN",
      },
    });
    // If tied to a milestone, block it from being released while dispute open.
    if (parsed.data.milestoneId) {
      const milestone = await tx.milestone.findUnique({
        where: { id: parsed.data.milestoneId },
        select: { id: true, status: true },
      });
      if (milestone && ["FUNDED", "SUBMITTED", "APPROVED"].includes(milestone.status)) {
        await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: "DISPUTED" },
        });
      }
    }
    return d;
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "dispute.opened",
    targetType: "Dispute",
    targetId: dispute.id,
    metadata: { category: parsed.data.category, milestoneId: parsed.data.milestoneId },
  });
  return dispute;
});
