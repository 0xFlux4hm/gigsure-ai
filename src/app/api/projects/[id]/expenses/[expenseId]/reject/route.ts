/** Client rejects an expense request. */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { rejectExpense } from "@/lib/payments/expense-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({ reason: z.string().min(3).max(500) });

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Reason is required", 422);

  // SECURITY: Verify the expense belongs to the project in the URL
  const expense = await db.projectExpense.findUnique({
    where: { id: params.expenseId },
    select: { projectId: true },
  });
  if (!expense || expense.projectId !== params.id) {
    return fail("Expense not found in this project", 404);
  }

  try {
    await rejectExpense(params.expenseId, userId, parsed.data.reason);
    return { rejected: true };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to reject expense", 400);
  }
});
