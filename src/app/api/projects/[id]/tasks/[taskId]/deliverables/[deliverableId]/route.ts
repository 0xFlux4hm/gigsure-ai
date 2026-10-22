/**
 * Download a deliverable file.
 *
 * GET /api/projects/[id]/tasks/[taskId]/deliverables/[deliverableId]
 *   — streams the file content with proper Content-Type + Content-Disposition headers
 *
 * DELETE /api/projects/[id]/tasks/[taskId]/deliverables/[deliverableId]
 *   — removes a deliverable (only by the submitter or project owner)
 */
import { db } from "@/lib/db";
import { fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; taskId: string; deliverableId: string }> }) {
  const { id: projectId, taskId, deliverableId } = await params;
  const userId = await requireUserId();

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) {
    return new Response("Forbidden", { status: 403 });
  }

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      filename: true,
      contentType: true,
      data: true,
      taskId: true,
    },
  });

  if (!deliverable || deliverable.taskId !== taskId) {
    return new Response("Deliverable not found", { status: 404 });
  }

  if (!deliverable.data) {
    return new Response("File data not available", { status: 404 });
  }

  return new Response(deliverable.data, {
    status: 200,
    headers: {
      "Content-Type": deliverable.contentType,
      "Content-Disposition": `attachment; filename="${deliverable.filename}"`,
      "Content-Length": deliverable.data.length.toString(),
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; taskId: string; deliverableId: string }> }) {
  const { id: projectId, taskId, deliverableId } = await params;
  const userId = await requireUserId();

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, submitterId: true, taskId: true },
  });

  if (!deliverable || deliverable.taskId !== taskId) {
    return fail("Deliverable not found", 404);
  }

  // Only the submitter or project owner/client can delete
  if (deliverable.submitterId !== userId && membership.role !== "OWNER" && membership.role !== "CLIENT") {
    return fail("You can only delete your own deliverables", 403);
  }

  await db.deliverable.delete({ where: { id: deliverableId } });

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "deliverable.deleted",
    targetType: "Deliverable",
    targetId: deliverableId,
    metadata: { taskId },
  });

  return { deleted: true };
}
