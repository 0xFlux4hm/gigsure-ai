/**
 * Payment provider interface — provider-independent abstraction.
 *
 * Every provider (Monnify, OPay, Mock) implements this interface.
 * The application domain never depends on a provider's specific response format.
 */
import type { FeePolicy } from "./fee-calculator";

export type PaymentProviderName = "mock" | "monnify" | "opay";

export type PaymentState =
  | "CREATED"
  | "PENDING"
  | "REQUIRES_ACTION"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "REVERSED"
  | "RECONCILIATION_REQUIRED";

// Legal state transitions
export const STATE_TRANSITIONS: Record<string, Set<string>> = {
  CREATED: new Set(["PENDING", "REQUIRES_ACTION", "FAILED", "EXPIRED", "CANCELED"]),
  PENDING: new Set(["SUCCEEDED", "FAILED", "EXPIRED", "CANCELED", "RECONCILIATION_REQUIRED"]),
  REQUIRES_ACTION: new Set(["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELED"]),
  SUCCEEDED: new Set(["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "RECONCILIATION_REQUIRED"]),
  FAILED: new Set(["RECONCILIATION_REQUIRED"]),
  EXPIRED: new Set(["RECONCILIATION_REQUIRED"]),
  CANCELED: new Set([]),
  REFUND_PENDING: new Set(["PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "RECONCILIATION_REQUIRED"]),
  PARTIALLY_REFUNDED: new Set(["REFUND_PENDING", "REFUNDED", "RECONCILIATION_REQUIRED"]),
  REFUNDED: new Set(["RECONCILIATION_REQUIRED"]),
  REVERSED: new Set(["RECONCILIATION_REQUIRED"]),
  RECONCILIATION_REQUIRED: new Set(["SUCCEEDED", "FAILED", "REFUNDED", "REVERSED"]),
};

export function isValidTransition(from: PaymentState, to: PaymentState): boolean {
  return STATE_TRANSITIONS[from]?.has(to) ?? false;
}

export type InitiatePaymentInput = {
  paymentReference: string; // internal unique reference
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  paymentDescription: string;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
  // Fee breakdown for transparency
  feeMinor: number;
  netMinor: number;
  policyVersion: string;
};

export type InitiatePaymentResult = {
  provider: PaymentProviderName;
  providerReference: string; // provider's transaction reference
  checkoutUrl?: string; // URL for hosted checkout (if applicable)
  status: PaymentState;
  rawResponse?: Record<string, unknown>;
};

export type VerifyPaymentResult = {
  providerReference: string;
  status: PaymentState;
  amountPaidMinor?: number;
  currency?: string;
  paidAt?: Date;
  paymentMethod?: string;
  rawResponse?: Record<string, unknown>;
};

export type RefundInput = {
  providerReference: string;
  amountMinor: number; // refund amount
  reason?: string;
};

export type RefundResult = {
  refundReference: string;
  status: PaymentState;
  amountMinor: number;
  rawResponse?: Record<string, unknown>;
};

export type WebhookVerificationResult = {
  valid: boolean;
  provider: PaymentProviderName;
  eventType: string;
  providerReference: string;
  rawPayload: string;
};

export type ProviderHealth = {
  name: PaymentProviderName;
  enabled: boolean;
  configured: boolean;
  environment: "sandbox" | "production" | "mock";
  message: string;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  isConfigured(): boolean;
  isEnabled(): boolean;

  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyPayment(providerReference: string): Promise<VerifyPaymentResult>;
  requestRefund(input: RefundInput): Promise<RefundResult>;

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): WebhookVerificationResult;

  health(): ProviderHealth;
}
