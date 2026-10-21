/** Get payment status + fee breakdown for a transaction. */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments/registry";

export const GET = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const reference = params.reference;

  const transaction = await db.paymentTransaction.findFirst({
    where: {
      OR: [
        { paymentReference: reference },
        { providerReference: reference },
      ],
      userId,
    },
    include: {
      ledgerEntries: true,
    },
  });

  if (!transaction) return fail("Payment not found", 404);

  // If transaction is in a non-terminal state, poll the provider for latest status
  if (["CREATED", "PENDING", "REQUIRES_ACTION"].includes(transaction.status)) {
    try {
      const provider = getProvider(transaction.provider as "monnify" | "opay");
      if (transaction.providerReference) {
        const result = await provider.verifyPayment(transaction.providerReference);
        if (result.status !== transaction.status) {
          // Update status in DB
          await db.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: result.status,
              paidAt: result.paidAt ?? undefined,
              paymentMethod: result.paymentMethod ?? undefined,
            },
          });
          transaction.status = result.status;
        }
      }
    } catch {
      // Provider unavailable — keep current status
    }
  }

  return {
    transactionId: transaction.id,
    paymentReference: transaction.paymentReference,
    provider: transaction.provider,
    providerReference: transaction.providerReference,
    status: transaction.status,
    amountMinor: transaction.amountMinor,
    feeMinor: transaction.feeMinor,
    netMinor: transaction.netMinor,
    feeRateBps: transaction.feeRateBps,
    feePolicyVersion: transaction.feePolicyVersion,
    currency: transaction.currency,
    checkoutUrl: transaction.checkoutUrl,
    paidAt: transaction.paidAt,
    createdAt: transaction.createdAt,
    ledgerEntries: transaction.ledgerEntries.map((e) => ({
      type: e.entryType,
      amount: e.amountMinor,
      account: e.accountType,
      description: e.description,
    })),
  };
});
