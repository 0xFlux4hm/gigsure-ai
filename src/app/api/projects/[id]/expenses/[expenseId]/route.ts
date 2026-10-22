/** Get a single expense's details. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { AuthzError } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: params.id, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const expense = await db.projectExpense.findUnique({
    where: { id: params.expenseId },
    include: {
      requestedBy: { select: { id: true, displayName: true, email: true } },
      approvedBy: { select: { id: true, displayName: true } },
      milestone: { select: { id: true, title: true, status: true } },
      fundingRecord: { select: { id: true, status: true, providerTxRef: true } },
    },
  });
  if (!expense || expense.projectId !== params.id) return fail("Expense not found", 404);

  return { expense };
});
