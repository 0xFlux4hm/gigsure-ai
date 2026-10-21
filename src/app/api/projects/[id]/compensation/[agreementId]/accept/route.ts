/**
 * Accept a compensation allocation.
 *
 * A user may accept only their OWN allocation. Once all allocations are
 * accepted, the agreement flips to ACCEPTED.
 *
 * Same TOCTOU race as contract version acceptance —
 * findUnique + create + count + conditional update were not atomic.
 * Wrapped in `db.$transaction(async (tx) => ...)` to fix.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

class CompensationAcceptError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, agreementId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  let allAccepted = false;
  let versionNumber = 0;

  try {
    const result = await db.$transaction(async (tx) => {
      const agreement = await tx.compensationAgreement.findUnique({
        where: { id: agreementId },
        include: { allocations: true, acceptances: true },
      });
      if (!agreement || agreement.projectId !== projectId) {
        throw new CompensationAcceptError("Compensation agreement not found", 404);
      }
      if (agreement.status === "SUPERSEDED") throw new CompensationAcceptError("Agreement has been superseded", 400);
      if (agreement.status === "ACCEPTED") throw new CompensationAcceptError("Agreement already accepted", 400);

      const ownAllocation = agreement.allocations.find((a) => a.userId === userId);
      if (!ownAllocation) {
        throw new CompensationAcceptError("You do not have an allocation in this agreement", 403);
      }

      const already = agreement.acceptances.find((a) => a.userId === userId);
      if (already) throw new CompensationAcceptError("You have already accepted this agreement", 409);

      await tx.compensationAcceptance.create({
        data: { compensationAgreementId: agreementId, userId },
      });

      // If all allocation users have accepted, flip to ACCEPTED.
      const requiredUserIds = new Set(agreement.allocations.map((a) => a.userId));
      const acceptedIds = new Set([
        ...agreement.acceptances.map((a) => a.userId),
        userId,
      ]);
      allAccepted = [...requiredUserIds].every((id) => acceptedIds.has(id));
      versionNumber = agreement.versionNumber;
      if (allAccepted) {
        await tx.compensationAgreement.update({
          where: { id: agreementId },
          data: { status: "ACCEPTED" },
        });
      }
      return { agreement, allAccepted };
    });
    allAccepted = result.allAccepted;
    versionNumber = result.agreement.versionNumber;
  } catch (err) {
    if (err instanceof CompensationAcceptError) {
      return fail(err.message, err.status);
    }
    if ((err as { code?: string }).code === "P2002") {
      return fail("You have already accepted this agreement", 409);
    }
    throw err;
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "compensation.accepted",
    targetType: "CompensationAgreement",
    targetId: agreementId,
    metadata: { version: versionNumber, allAccepted },
  });
  return { accepted: true, allAccepted };
});
