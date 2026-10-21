/**
 * Enhanced Mock payment provider.
 *
 * Implements the same PaymentProvider interface as Monnify/OPay.
 * Used for local development and automated testing.
 *
 * All transactions are clearly labelled as simulated.
 */
import type {
  PaymentProvider,
  PaymentProviderName,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyPaymentResult,
  RefundInput,
  RefundResult,
  WebhookVerificationResult,
  ProviderHealth,
  PaymentState,
} from "./provider-interface";
import { signWebhookPayload } from "@/lib/security/tokens";
import { generateProviderTxRef } from "@/lib/security/tokens";

export const MOCK_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret-dev-only";

export class MockPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "mock";

  isConfigured(): boolean {
    return true;
  }

  isEnabled(): boolean {
    return true; // mock is always enabled
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const providerRef = generateProviderTxRef("MOCK");

    // Simulate async: in a real provider, we'd POST to their API
    // and get a checkout URL back. For mock, we generate a fake URL.
    return {
      provider: "mock",
      providerReference: providerRef,
      checkoutUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/?view=mock-checkout&ref=${providerRef}`,
      status: "PENDING",
    };
  }

  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> {
    // Mock: always returns SUCCEEDED (for successful flow testing)
    // Tests can override this behavior by checking the reference pattern.
    const isFailure = providerReference.includes("FAIL");
    const isExpired = providerReference.includes("EXPIRE");

    return {
      providerReference,
      status: isFailure ? "FAILED" : isExpired ? "EXPIRED" : "SUCCEEDED",
      amountPaidMinor: isFailure ? 0 : undefined,
      currency: "NGN",
      paidAt: isFailure ? undefined : new Date(),
      paymentMethod: "mock_transfer",
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    return {
      refundReference: `mock_refund_${Date.now()}`,
      status: "REFUND_PENDING",
      amountMinor: input.amountMinor,
    };
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): WebhookVerificationResult {
    const signature = headers["x-gigsure-signature"] ?? "";
    const valid = signature === signWebhookPayload(rawBody, MOCK_WEBHOOK_SECRET);

    let eventType = "unknown";
    let providerReference = "";
    try {
      const payload = JSON.parse(rawBody) as {
        event?: string;
        provider_tx_ref?: string;
        provider_event_id?: string;
      };
      eventType = payload.event ?? "unknown";
      providerReference = payload.provider_tx_ref ?? "";
    } catch {
      // malformed
    }

    return {
      valid,
      provider: "mock",
      eventType,
      providerReference,
      rawPayload: rawBody,
    };
  }

  health(): ProviderHealth {
    return {
      name: "mock",
      enabled: true,
      configured: true,
      environment: "mock",
      message: "Mock provider — always available for development",
    };
  }
}
