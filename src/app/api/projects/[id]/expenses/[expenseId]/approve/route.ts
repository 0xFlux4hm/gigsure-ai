/** Client approves an expense request. */
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { approveExpense } from "@/lib/payments/expense-service";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  try {
    await approveExpense(params.expenseId, userId);
    return { approved: true, message: "Expense approved. Funds will be released to the service provider." };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to approve expense", 400);
  }
});
