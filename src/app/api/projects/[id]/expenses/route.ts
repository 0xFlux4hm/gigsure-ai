/**
 * List and create project expenses.
 *
 * GET  /api/projects/[id]/expenses           — list all expenses for a project
 * POST /api/projects/[id]/expenses           — service provider requests an expense
 *   Body: { milestoneId, title, description?, category, amountMinor }
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { createExpenseRequest, type ExpenseCategory } from "@/lib/payments/expense-service";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/admin-access";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  milestoneId: z.string().cuid(),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  category: z.enum([
    "DOMAIN_HOSTING",
    "SOFTWARE_LICENSE",
    "STOCK_ASSETS",
    "THIRD_PARTY_SERVICES",
    "HARDWARE",
    "OTHER",
  ]),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  const expenses = await db.projectExpense.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      requestedBy: { select: { id: true, displayName: true, email: true } },
      approvedBy: { select: { id: true, displayName: true } },
      milestone: { select: { id: true, title: true } },
    },
  });

  return { expenses };
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const body = await parseJsonBody<unknown>(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid expense request", 422);
  }

  const project = await db.project.findUnique({
    where: { id: params.id },
    select: { currency: true },
  });
  if (!project) return fail("Project not found", 404);

  try {
    const result = await createExpenseRequest({
      projectId: params.id,
      milestoneId: parsed.data.milestoneId,
      requestedById: userId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category as ExpenseCategory,
      amountMinor: parsed.data.amountMinor,
      currency: project.currency,
    });
    return { ...result, message: "Expense request submitted. The client will be notified to approve." };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to create expense request", 400);
  }
});
