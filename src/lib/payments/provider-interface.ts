import type { FeePolicy } from "./fee-calculator";

export type PaymentProviderName = "monnify" | "opay" | "paypal";

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
  CREATED: new Set(["PENDING", "REQUIRES_ACTION", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELED"]),
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
  environment: "sandbox" | "production";
  message: string;
};

// ---------------------------------------------------------------------------
// PAYOUT (TRANSFER) TYPES — platform → worker bank account
// ---------------------------------------------------------------------------

export type TransferInput = {
  payoutReference: string; // internal unique payout reference (e.g., GS_payout_xxx)
  amountMinor: number; // amount to land in worker's account (net)
  currency: string;
  recipient: {
    accountName: string;
    accountNumber: string; // 10-digit NUBAN
    bankCode: string;
    bankName: string;
  };
  narration: string; // appears on the worker's bank statement
  metadata?: Record<string, unknown>;
};

export type TransferResult = {
  provider: PaymentProviderName;
  providerReference: string; // provider's transfer reference (used for status polling)
  status: PaymentState; // usually PENDING or SUCCEEDED
  rawResponse?: Record<string, unknown>;
};

export type VerifyTransferResult = {
  providerReference: string;
  status: PaymentState;
  amountMinor?: number; // amount actually transferred
  settledAt?: Date;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
};

export type BankInfo = {
  code: string;
  name: string;
  shortName?: string;
};

export type NameEnquiryResult = {
  valid: boolean;
  accountName?: string; // name as returned by the bank
  bankCode: string;
  accountNumber: string;
  enquiryReference?: string; // provider's enquiry reference (Monnify requires this for transfer)
  rawResponse?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// VIRTUAL ACCOUNT (RESERVED ACCOUNT) TYPES — for client funding
// ---------------------------------------------------------------------------

export type ReservedAccountInput = {
  // Per-project or per-milestone reserved bank account that the client
  // transfers money into via simple bank transfer.
  reference: string; // unique reference for this reservation (e.g., project slug)
  accountName: string; // how the account name appears (e.g., "GigSure/ProjectName")
  expectedAmountMinor?: number; // optional amount cap
  currency: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
};

export type ReservedAccountResult = {
  provider: PaymentProviderName;
  providerAccountRef: string; // provider's reserved account reference
  accountNumber: string; // 10-digit NUBAN the client transfers to
  accountName: string;
  bankName: string;
  bankCode: string;
  status: "ACTIVE" | "EXPIRED" | "DEALLOCATED";
  expiresAt?: Date;
  rawResponse?: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  isConfigured(): boolean;
  isEnabled(): boolean;

  // Inbound: client → platform
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyPayment(providerReference: string): Promise<VerifyPaymentResult>;
  requestRefund(input: RefundInput): Promise<RefundResult>;

  // Outbound: platform → worker (payouts)
  // Default: not implemented (throws) — providers override if they support payouts.
  initiateTransfer?(input: TransferInput): Promise<TransferResult>;
  verifyTransfer?(providerReference: string): Promise<VerifyTransferResult>;
  listBanks?(): Promise<BankInfo[]>;
  resolveAccountName?(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<NameEnquiryResult>;

  // Virtual account: per-project reserved account for client funding via bank transfer
  createReservedAccount?(input: ReservedAccountInput): Promise<ReservedAccountResult>;
  deallocateReservedAccount?(providerAccountRef: string): Promise<void>;

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): WebhookVerificationResult | Promise<WebhookVerificationResult>;

  health(): ProviderHealth;
}
