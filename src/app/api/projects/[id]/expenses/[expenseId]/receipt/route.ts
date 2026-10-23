/**
 * Upload a receipt for a released expense (proof of purchase).
 * Body: { receiptUrl }
 *
 * SECURITY: Verifies the expense belongs to the project in the URL and
 * that the caller is a project member.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { uploadExpenseReceipt } from "@/lib/payments/expense-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  // SECURITY: Only allow http/https URLs — rejects javascript:, data:, etc.
  receiptUrl: z
    .string()
    .url()
    .max(2048)
    .refine((url) => /^https:\/\//i.test(url), "Only HTTPS URLs are allowed"),
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();

  // SECURITY: Verify the expense belongs to the project in the URL
  const expense = await db.projectExpense.findUnique({
    where: { id: params.expenseId },
    select: { projectId: true },
  });
  if (!expense || expense.projectId !== params.id) {
    return fail("Expense not found in this project", 404);
  }

  // Verify caller is a project member
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Valid receipt URL is required", 422);

  try {
    await uploadExpenseReceipt(params.expenseId, userId, parsed.data.receiptUrl);
    return { uploaded: true, message: "Receipt uploaded. The client will be notified." };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to upload receipt", 400);
  }
});
