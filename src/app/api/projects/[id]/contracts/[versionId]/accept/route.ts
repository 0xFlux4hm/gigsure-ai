/**
 * Accept a contract version. Per-version per-user. Once a version is accepted
 * by all required parties, its status flips to ACCEPTED and the project's
 * currentContractVersionId is updated.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const { id: projectId, versionId } = params;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "contract:accept");

  const version = await db.contractVersion.findUnique({
    where: { id: versionId },
    include: { acceptances: true },
  });
  if (!version) return fail("Contract version not found", 404);
  if (version.projectId !== projectId) return fail("Version does not belong to this project", 400);
  if (version.status === "SUPERSEDED") return fail("This version has been superseded", 400);
  if (version.status === "CANCELLED") return fail("This version has been cancelled", 400);
  if (version.status === "DRAFT") return fail("This version is still in draft", 400);

  const alreadyAccepted = version.acceptances.find((a) => a.userId === userId);
  if (alreadyAccepted) return fail("You have already accepted this version", 409);

  await db.contractAcceptance.create({
    data: { contractVersionId: versionId, userId },
  });

  // Count members who must accept (OWNER + CLIENT + each COLLABORATOR).
  const members = await db.projectMembership.findMany({
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
  const allAccepted = required.every((m) => acceptedUserIds.has(m.userId));

  if (allAccepted) {
    // Mark prior accepted version (if any) as SUPERSEDED, then mark this ACCEPTED.
    await db.$transaction([
      db.contractVersion.updateMany({
        where: { projectId, status: "ACCEPTED", id: { not: versionId } },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      }),
      db.contractVersion.update({
        where: { id: versionId },
        data: { status: "ACCEPTED" },
      }),
      db.project.update({
        where: { id: projectId },
        data: { currentContractVersionId: versionId, status: "ACTIVE" },
      }),
    ]);
  }

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "contract.accepted",
    targetType: "ContractVersion",
    targetId: versionId,
    metadata: { version: version.versionNumber, allAccepted },
  });

  return { accepted: true, allAccepted };
});
