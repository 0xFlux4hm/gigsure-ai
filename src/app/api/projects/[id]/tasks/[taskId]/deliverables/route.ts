/**
 * List and upload deliverables for a task.
 *
 * GET  /api/projects/[id]/tasks/[taskId]/deliverables
 *   — list all deliverables for the task (metadata only, no file data)
 *
 * POST /api/projects/[id]/tasks/[taskId]/deliverables
 *   — upload a file deliverable (multipart/form-data)
 *   - Body: FormData with "file" field
 *   - Max size: 5MB (serverless-friendly)
 *   - Allowed types: images, PDFs, documents, archives
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { generateToken } from "@/lib/security/tokens";

import { isPlatformAdmin } from "@/lib/auth/admin-access";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  // SVG removed — can carry <script> payloads (stored XSS)
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
];

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  // HACKATHON FIX (Oct 29, 2026): platform admins get read access for oversight
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  // SECURITY: Verify the task belongs to the project in the URL
  const task = await db.task.findUnique({
    where: { id: params.taskId },
    select: { projectId: true },
  });
  if (!task || task.projectId !== params.id) {
    return { deliverables: [] };
  }

  const deliverables = await db.deliverable.findMany({
    where: { taskId: params.taskId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      status: true,
      submittedAt: true,
      submitter: { select: { id: true, displayName: true } },
    },
  });

  return { deliverables };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  // Verify the task exists and belongs to this project
  const task = await db.task.findUnique({
    where: { id: params.taskId },
    select: { id: true, projectId: true, title: true },
  });
  if (!task || task.projectId !== params.id) {
    return fail("Task not found in this project", 404);
  }

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return fail("No file provided. Use multipart/form-data with a 'file' field.", 400);
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return fail(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`, 413);
  }

  // Validate content type
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return fail(`File type "${contentType}" is not allowed. Allowed: images, PDFs, documents, archives.`, 415);
  }

  // Read file content as Buffer
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // Generate a storage key (for future S3/Blob migration — currently using DB)
  const storageKey = `deliverables/${params.id}/${params.taskId}/${generateToken(16)}`;

  // SECURITY: Sanitize the filename to prevent path traversal and header injection
  const safeFilename = (file.name || "file")
    .replace(/["\r\n]/g, "") // Remove quotes, CRLF (header injection)
    .replace(/[<>]/g, "") // Remove angle brackets (XSS prevention)
    .replace(/\.\./g, ".") // Collapse path traversal sequences
    .replace(/[\\/:*?"<>|]/g, "_") // Replace invalid filename chars with underscore
    .slice(0, 255); // Cap length

  // Create the deliverable record
  const deliverable = await db.deliverable.create({
    data: {
      taskId: params.taskId,
      submitterId: userId,
      filename: safeFilename,
      contentType,
      sizeBytes: file.size,
      storageKey,
      data: fileBuffer,
    },
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      status: true,
      submittedAt: true,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: params.id,
    action: "deliverable.uploaded",
    targetType: "Deliverable",
    targetId: deliverable.id,
    metadata: {
      taskId: params.taskId,
      taskTitle: task.title,
      filename: safeFilename, // use sanitized name in audit log too
      contentType,
      sizeBytes: file.size,
    },
  });

  return {
    deliverable,
    message: "File uploaded successfully.",
  };
});
