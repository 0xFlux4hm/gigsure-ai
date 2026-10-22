/**
 * Update or delete a specific bank-detail entry for the current user.
 *
 * PATCH /api/users/me/bank-details/[id]
 *   Body: { isDefault? } (only the isDefault flag is mutable after creation;
 *   account number / bank cannot be changed — user must delete and re-add)
 *
 * DELETE /api/users/me/bank-details/[id]
 *   Removes the bank account. Cannot remove if there's a PENDING payout to it.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  isDefault: z.boolean().optional(),
});

export const PATCH = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const id = params.id;

  const existing = await db.bankDetail.findUnique({
    where: { id },
    select: { id: true, userId: true, accountNumber: true, bankCode: true },
  });
  if (!existing || existing.userId !== userId) {
    return fail("Bank account not found", 404);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid update payload", 422);
  }

  const { isDefault } = parsed.data;
  const updated = await db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.bankDetail.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.bankDetail.update({
      where: { id },
      data: { isDefault },
    });
  });

  await recordAuditEvent({
    actorId: userId,
    action: "bank_detail.updated",
    targetType: "BankDetail",
    targetId: id,
    metadata: { isDefault },
  });

  return {
    bankDetail: {
      id: updated.id,
      accountName: updated.accountName,
      accountNumber: updated.accountNumber,
      bankCode: updated.bankCode,
      bankName: updated.bankName,
      isDefault: updated.isDefault,
      isVerified: updated.isVerified,
    },
  };
});

export const DELETE = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const id = params.id;

  const existing = await db.bankDetail.findUnique({
    where: { id },
    select: { id: true, userId: true, payouts: { where: { status: "PENDING" }, select: { id: true } } },
  });
  if (!existing || existing.userId !== userId) {
    return fail("Bank account not found", 404);
  }
  if (existing.payouts.length > 0) {
    return fail(
      "Cannot delete a bank account that has a pending payout. Wait for the payout to settle or fail first.",
      409,
    );
  }

  await db.bankDetail.delete({ where: { id } });

  await recordAuditEvent({
    actorId: userId,
    action: "bank_detail.deleted",
    targetType: "BankDetail",
    targetId: id,
  });

  return { deleted: true };
});
