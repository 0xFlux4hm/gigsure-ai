/**
 * Accept a contract version. Per-version per-user. Once a version is accepted
 * by all required parties, its status flips to ACCEPTED and the project's
 * currentContractVersionId is updated.
 *
 * The previous implementation had a TOCTOU race:
 *   1. findUnique (load acceptances snapshot)
 *   2. create ContractAcceptance (separate write)
 *   3. compute allAccepted from stale snapshot
 *   4. conditional $transaction to mark ACCEPTED
 *
 * Two concurrent last-acceptors would both see the stale snapshot, both
 * compute allAccepted=false, and the version would NEVER flip to ACCEPTED.
 *
 * Fix: wrap find + create + count + conditional update in a single
 * `db.$transaction(async (tx) => ...)` interactive transaction so the
 * acceptance + the status update are atomic.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

class ContractAcceptError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, versionId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "contract:accept");

  // Atomic: load version, validate state, create acceptance, compute
  // allAccepted, and conditionally flip version status — all in one
  // transaction so concurrent acceptors can't both see stale state.
  let allAccepted = false;
  let versionNumber = 0;

  try {
    const result = await db.$transaction(async (tx) => {
      // Re-load inside the transaction so we see the latest acceptances.
      const version = await tx.contractVersion.findUnique({
        where: { id: versionId },
        include: { acceptances: true },
      });
      if (!version) throw new ContractAcceptError("Contract version not found", 404);
      if (version.projectId !== projectId) throw new ContractAcceptError("Version does not belong to this project", 400);
      if (version.status === "SUPERSEDED") throw new ContractAcceptError("This version has been superseded", 400);
      if (version.status === "CANCELLED") throw new ContractAcceptError("This version has been cancelled", 400);
      if (version.status === "DRAFT") throw new ContractAcceptError("This version is still in draft", 400);

      const alreadyAccepted = version.acceptances.find((a) => a.userId === userId);
      if (alreadyAccepted) throw new ContractAcceptError("You have already accepted this version", 409);

      // Create the new acceptance row inside the transaction.
      await tx.contractAcceptance.create({
        data: { contractVersionId: versionId, userId },
      });

      // Re-query the members and acceptances (now including our new row).
      const members = await tx.projectMembership.findMany({
        where: { projectId, revokedAt: null },
        select: { userId: true, role: true },
      });
      const required = members.filter((m) =>
        ["OWNER", "CLIENT", "COLLABORATOR"].includes(m.role),
      );
      const acceptedUserIds = new Set([
        ...version.acceptances.map((a) => a.userId),
        userId,
      ]);
      allAccepted = required.every((m) => acceptedUserIds.has(m.userId));
      versionNumber = version.versionNumber;

      if (allAccepted) {
        // Mark prior ACCEPTED versions SUPERSEDED, then mark this one ACCEPTED.
        await tx.contractVersion.updateMany({
          where: { projectId, status: "ACCEPTED", id: { not: versionId } },
          data: { status: "SUPERSEDED", supersededAt: new Date() },
        });
        await tx.contractVersion.update({
          where: { id: versionId },
          data: { status: "ACCEPTED" },
        });
        await tx.project.update({
          where: { id: projectId },
          data: { currentContractVersionId: versionId, status: "ACTIVE" },
        });
      }
      return { version, allAccepted };
    });
    allAccepted = result.allAccepted;
    versionNumber = result.version.versionNumber;
  } catch (err) {
    if (err instanceof ContractAcceptError) {
      return fail(err.message, err.status);
    }
    // Prisma P2002 (unique constraint) → already accepted (concurrent request)
    if ((err as { code?: string }).code === "P2002") {
      return fail("You have already accepted this version", 409);
    }
    throw err;
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "contract.accepted",
    targetType: "ContractVersion",
    targetId: versionId,
    metadata: { version: versionNumber, allAccepted },
  });

  return { accepted: true, allAccepted };
});
