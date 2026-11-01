/**
 * Manually verify a PayPal payment by checking the order status directly.
 *
 * This is a fallback for when PayPal sandbox webhooks don't fire (which
 * happens frequently in the sandbox environment). The client calls this
 * endpoint after the user returns from the PayPal checkout, and we
 * check the order status via PayPal's Orders API.
 *
 * If the payment is COMPLETED, we confirm the FundingRecord + update
 * the PaymentTransaction — same as what the webhook would do.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments/registry";
import { confirmFundingRecord } from "@/lib/payments/webhook-handler";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  paymentTransactionId: z.string().cuid().optional(),
  paypalOrderId: z.string().optional(),
}).refine(
  (data) => data.paymentTransactionId || data.paypalOrderId,
  { message: "Either paymentTransactionId or paypalOrderId is required" },
);

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid request", 422);
  }

  const { paymentTransactionId, paypalOrderId } = parsed.data;

  // Look up the transaction by either ID or PayPal order ID
  let transaction;
  if (paymentTransactionId) {
    transaction = await db.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
    });
  } else if (paypalOrderId) {
    transaction = await db.paymentTransaction.findFirst({
      where: { providerReference: paypalOrderId },
    });
  }

  // Fallback: if no transaction found, try the most recent CREATED PayPal
  // transaction for this user. This handles the case where the frontend
  // lost the paymentTxId (e.g., page reload on mobile after returning
  // from PayPal checkout).
  if (!transaction) {
    transaction = await db.paymentTransaction.findFirst({
      where: {
        userId,
        provider: "paypal",
        status: "CREATED",
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!transaction) {
    return fail("Payment transaction not found", 404);
  }

  if (transaction.userId !== userId) {
    return fail("You can only verify your own payments", 403);
  }

  if (transaction.status === "SUCCEEDED") {
    return { verified: true, message: "Payment already confirmed" };
  }

  const provider = getProvider("paypal");
  const providerReference = transaction.providerReference;
  if (!providerReference) {
    return fail("No PayPal order reference found for this transaction", 400);
  }

  try {
    const result = await provider.verifyPayment(providerReference);

    if (result.status === "SUCCEEDED") {
      await db.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "SUCCEEDED",
          paidAt: new Date(),
          paymentMethod: result.paymentMethod ?? "paypal",
        },
      });

      let fundingConfirmed = false;
      let fundingError: string | undefined;
      try {
        const confirmResult = await confirmFundingRecord({
          provider: "paypal",
          providerEventId: `manual_verify_${transaction.id}`,
          providerTxRef: providerReference,
          eventType: "PAYMENT.CAPTURE.COMPLETED",
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          status: "PROVIDER_CONFIRMED",
          rawPayload: JSON.stringify(result.rawResponse ?? {}),
          signatureValid: true,
          paymentTransactionId: transaction.id,
        });
        fundingConfirmed = confirmResult.processed;
        if (!confirmResult.processed) {
          fundingError = `Funding record not confirmed: ${confirmResult.reason}`;
        }
      } catch (err) {
        fundingError = (err as Error)?.message ?? "Unknown error";
        logSecurityEvent("warn", "payment.manual_verify_funding_failed", {
          transactionId: transaction.id,
          message: fundingError,
        });
      }

      await recordAuditEvent({
        actorId: userId,
        projectId: transaction.projectId,
        action: "payment.manual_verify_success",
        targetType: "PaymentTransaction",
        targetId: transaction.id,
        metadata: {
          provider: "paypal",
          providerReference,
          amountPaidMinor: result.amountPaidMinor,
        },
      });

      return {
        verified: true,
        message: fundingConfirmed
          ? "Payment confirmed and funding record updated."
          : `Payment confirmed but funding record issue: ${fundingError ?? "unknown"}`,
        status: result.status,
        amountPaidMinor: result.amountPaidMinor,
        fundingConfirmed,
        fundingError,
      };
    } else {
      return {
        verified: false,
        message: `Payment status is ${result.status}.`,
        status: result.status,
        detail: "Make sure you approved the payment in the PayPal sandbox tab before clicking verify. If you already approved it, the order may need to be captured — the server will do this automatically.",
      };
    }
  } catch (err) {
    logSecurityEvent("warn", "payment.manual_verify_failed", {
      transactionId: transaction.id,
      message: (err as Error)?.message,
    });
    return fail(
      `Failed to verify payment: ${(err as Error)?.message ?? "Unknown error"}`,
      502,
    );
  }
});
