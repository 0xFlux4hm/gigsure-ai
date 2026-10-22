/**
 * Release approved expense funds to the service provider.
 * Called by the client after approving — triggers the payout.
 */
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { releaseExpense } from "@/lib/payments/expense-service";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  try {
    const result = await releaseExpense(params.expenseId, userId);
    return {
      ...result,
      message: "Expense funds released. The service provider will receive the payout shortly.",
    };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to release expense", 400);
  }
});
