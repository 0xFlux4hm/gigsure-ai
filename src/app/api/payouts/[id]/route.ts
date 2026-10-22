/**
 * Get a single payout's details.
 * Visible to the payee, the initiator, or admins.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const id = params.id;

  const payout = await db.payout.findUnique({
    where: { id },
    include: {
      payee: { select: { id: true, displayName: true, email: true } },
      initiatedBy: { select: { id: true, displayName: true } },
      project: { select: { id: true, title: true } },
      milestone: { select: { id: true, title: true, status: true } },
      bankDetail: { select: { id: true, accountName: true, accountNumber: true, bankName: true } },
      webhookEvents: { take: 5, orderBy: { createdAt: "desc" } },
    },
  });
  if (!payout) return fail("Payout not found", 404);

  // Authorization: payee, initiator, or admin.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  const isAdmin = user?.platformRole === "ADMIN";
  if (!isAdmin && payout.payeeId !== userId && payout.initiatedById !== userId) {
    return fail("Payout not found", 404);
  }

  return { payout };
});
