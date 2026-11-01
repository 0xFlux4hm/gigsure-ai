import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const GET = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { transactionId } = await params;

  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true, userId: true },
  });

  if (!transaction) return fail("Transaction not found", 404);
  if (transaction.userId !== userId) return fail("Unauthorized", 403);

  return { status: transaction.status };
});
