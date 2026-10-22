/**
 * Release approved expense funds to the service provider.
 * Called by the client after approving — triggers the payout.
 *
 * SECURITY: Only the project OWNER or CLIENT can release expense funds.
 * The expense must belong to the project specified in the URL.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";
import { releaseExpense } from "@/lib/payments/expense-service";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();

  // Verify the expense exists and belongs to the project in the URL
  const expense = await db.projectExpense.findUnique({
    where: { id: params.expenseId },
    select: { id: true, projectId: true, status: true },
  });
  if (!expense || expense.projectId !== params.id) {
    return fail("Expense not found in this project", 404);
  }

  // Verify the user is a member of the project with OWNER or CLIENT role
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  if (membership.role !== "OWNER" && membership.role !== "CLIENT") {
    return fail("Only the project owner or client can release expense funds", 403);
  }

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
