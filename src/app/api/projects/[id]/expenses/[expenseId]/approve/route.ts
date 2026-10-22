/** Client approves an expense request. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { approveExpense } from "@/lib/payments/expense-service";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();

  // SECURITY: Verify the expense belongs to the project in the URL
  const expense = await db.projectExpense.findUnique({
    where: { id: params.expenseId },
    select: { projectId: true },
  });
  if (!expense || expense.projectId !== params.id) {
    return fail("Expense not found in this project", 404);
  }

  try {
    await approveExpense(params.expenseId, userId);
    return { approved: true, message: "Expense approved. Funds will be released to the service provider." };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to approve expense", 400);
  }
});
