/**
 * Accept a compensation allocation.
 *
 * A user may accept only their OWN allocation. Once all allocations are
 * accepted, the agreement flips to ACCEPTED.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, agreementId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const agreement = await db.compensationAgreement.findUnique({
    where: { id: agreementId },
    include: { allocations: true, acceptances: true },
  });
  if (!agreement || agreement.projectId !== projectId) {
    return fail("Compensation agreement not found", 404);
  }
  if (agreement.status === "SUPERSEDED") return fail("Agreement has been superseded", 400);
  if (agreement.status === "ACCEPTED") return fail("Agreement already accepted", 400);

  const ownAllocation = agreement.allocations.find((a) => a.userId === userId);
  if (!ownAllocation) {
    return fail("You do not have an allocation in this agreement", 403);
  }

  const already = agreement.acceptances.find((a) => a.userId === userId);
  if (already) return fail("You have already accepted this agreement", 409);

  await db.compensationAcceptance.create({
    data: { compensationAgreementId: agreementId, userId },
  });

  // If all allocation users have accepted, flip to ACCEPTED.
  const requiredUserIds = new Set(agreement.allocations.map((a) => a.userId));
  const acceptedIds = new Set([
    ...agreement.acceptances.map((a) => a.userId),
    userId,
  ]);
  const allAccepted = [...requiredUserIds].every((id) => acceptedIds.has(id));
  if (allAccepted) {
    await db.compensationAgreement.update({
      where: { id: agreementId },
      data: { status: "ACCEPTED" },
    });
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "compensation.accepted",
    targetType: "CompensationAgreement",
    targetId: agreementId,
    metadata: { version: agreement.versionNumber, allAccepted },
  });
  return { accepted: true, allAccepted };
});
