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
  TransferInput,
  TransferResult,
  VerifyTransferResult,
  BankInfo,
  NameEnquiryResult,
  ReservedAccountInput,
  ReservedAccountResult,
} from "./provider-interface";
import { signWebhookPayload } from "@/lib/security/tokens";
import { generateProviderTxRef } from "@/lib/security/tokens";

// Cached mock bank list — populated lazily on first call.
let MOCK_BANKS_CACHE: BankInfo[] | null = null;

const MOCK_BANKS: BankInfo[] = [
  { code: "044", name: "Access Bank Nigeria", shortName: "Access" },
  { code: "014", name: "Afribank Nigeria Plc", shortName: "Afribank" },
  { code: "023", name: "Citibank Nigeria", shortName: "Citibank" },
  { code: "063", name: "Diamond Bank", shortName: "Diamond" },
  { code: "050", name: "Ecobank Nigeria", shortName: "Ecobank" },
  { code: "011", name: "First Bank of Nigeria", shortName: "FirstBank" },
  { code: "214", name: "First City Monument Bank", shortName: "FCMB" },
  { code: "058", name: "Guaranty Trust Bank", shortName: "GTBank" },
  { code: "030", name: "Heritage Bank", shortName: "Heritage" },
  { code: "082", name: "Keystone Bank", shortName: "Keystone" },
  { code: "076", name: "Polaris Bank", shortName: "Polaris" },
  { code: "039", name: "Stanbic IBTC Bank", shortName: "Stanbic" },
  { code: "232", name: "Sterling Bank", shortName: "Sterling" },
  { code: "033", name: "United Bank for Africa", shortName: "UBA" },
  { code: "215", name: "Unity Bank", shortName: "Unity" },
  { code: "035", name: "Wema Bank", shortName: "Wema" },
  { code: "057", name: "Zenith Bank", shortName: "Zenith" },
  { code: "999", name: "GigSure Test Bank (Mock)", shortName: "GigsureMock" },
];

// Track simulated transfer states by providerReference so verifyTransfer returns consistent results.
const MOCK_TRANSFER_STATE = new Map<string, { status: PaymentState; amountMinor: number; createdAt: number }>();

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
    // validate amount at provider boundary (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid amountMinor: must be a positive finite number");
    }
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
    // validate refund amount (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid refund amount: must be a positive finite number");
    }
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

  // -------------------------------------------------------------------------
  // PAYOUT (TRANSFER) — platform → worker bank account
  // -------------------------------------------------------------------------

  async initiateTransfer(input: TransferInput): Promise<TransferResult> {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid amountMinor: must be a positive finite number");
    }
    if (!/^\d{10}$/.test(input.recipient.accountNumber)) {
      throw new Error("Mock transfer: recipient account number must be 10 digits");
    }
    if (!input.recipient.bankCode) {
      throw new Error("Mock transfer: bank code required");
    }

    const providerRef = generateProviderTxRef("MOCKPAYOUT");
    const isFailure = input.recipient.accountNumber.startsWith("0000000");

    // Simulate async transfer. Mark as SUCCEEDED immediately (or FAILED for test cases).
    const status: PaymentState = isFailure ? "FAILED" : "SUCCEEDED";
    MOCK_TRANSFER_STATE.set(providerRef, {
      status,
      amountMinor: input.amountMinor,
      createdAt: Date.now(),
    });

    return {
      provider: "mock",
      providerReference: providerRef,
      status,
      rawResponse: {
        simulated: true,
        recipient: input.recipient,
        amountMinor: input.amountMinor,
        narration: input.narration,
      },
    };
  }

  async verifyTransfer(providerReference: string): Promise<VerifyTransferResult> {
    const cached = MOCK_TRANSFER_STATE.get(providerReference);
    if (!cached) {
      return {
        providerReference,
        status: "PENDING",
        rawResponse: { simulated: true, note: "no cached mock transfer state" },
      };
    }

    return {
      providerReference,
      status: cached.status,
      amountMinor: cached.amountMinor,
      settledAt: cached.status === "SUCCEEDED" ? new Date(cached.createdAt) : undefined,
      failureReason: cached.status === "FAILED" ? "Simulated failure (recipient account starts with 0000000)" : undefined,
      rawResponse: { simulated: true },
    };
  }

  async listBanks(): Promise<BankInfo[]> {
    if (!MOCK_BANKS_CACHE) {
      MOCK_BANKS_CACHE = MOCK_BANKS;
    }
    // Return a fresh copy so callers can't mutate the cache.
    return MOCK_BANKS_CACHE.map((b) => ({ ...b }));
  }

  async resolveAccountName(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<NameEnquiryResult> {
    // Mock name enquiry: returns a deterministic fake name based on the account number.
    if (!/^\d{10}$/.test(input.accountNumber)) {
      return {
        valid: false,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
      };
    }
    // Derive a name from the last 4 digits so it's stable per account.
    const last4 = input.accountNumber.slice(-4);
    const accountName = `MOCK USER ${last4}`;

    return {
      valid: true,
      accountName,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      enquiryReference: `mock_enquiry_${Date.now()}`,
      rawResponse: { simulated: true },
    };
  }

  // -------------------------------------------------------------------------
  // VIRTUAL ACCOUNT (RESERVED ACCOUNT) — for client funding
  // -------------------------------------------------------------------------

  async createReservedAccount(input: ReservedAccountInput): Promise<ReservedAccountResult> {
    if (!input.reference) {
      throw new Error("Mock reserved account: reference is required");
    }
    if (!input.accountName) {
      throw new Error("Mock reserved account: accountName is required");
    }

    // Generate a deterministic 10-digit mock NUBAN from the reference hash.
    const refHash = Array.from(input.reference).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const accountNumber = String(3000000000 + (refHash % 6999999999)).slice(0, 10);

    return {
      provider: "mock",
      providerAccountRef: `mock_reserved_${input.reference}`,
      accountNumber,
      accountName: input.accountName,
      bankName: "GigSure Test Bank (Mock)",
      bankCode: "999",
      status: "ACTIVE",
      expiresAt: input.expectedAmountMinor ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
      rawResponse: { simulated: true, reference: input.reference },
    };
  }

  async deallocateReservedAccount(providerAccountRef: string): Promise<void> {
    // Mock: no-op. Just log.
    void providerAccountRef;
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
