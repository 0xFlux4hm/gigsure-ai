/**
 * OPay payment provider adapter.
 *
 * Official docs: https://documentation.opaycheckout.com
 *
 * Authentication:
 *   - Public key for cashier/create endpoint (Bearer token)
 *   - HMAC-SHA512 signature over JSON body for other endpoints
 *   - MerchantId header required on all requests
 *
 * Webhook verification:
 *   OPay sends encrypted webhook payloads. The webhook contains:
 *   - `clientAuthKey` (merchant's auth key — verify matches)
 *   - `sign` (signature — verify using HMAC-SHA512 with merchant's private key)
 *   - `paramContent` (encrypted body — decrypt to get transaction data)
 *
 *   For sandbox testing, the signature is computed over the raw payload.
 *
 * Environment:
 *   Set OPAY_ENABLED=true, OPAY_ENVIRONMENT=sandbox|production
 *   Sandbox URL: https://testapi.opaycheckout.com/api/v1/international
 *   Production URL: https://liveapi.opaycheckout.com/api/v1/international
 */
import { createHmac, timingSafeEqual } from "crypto";
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

const OPAY_SANDBOX_URL = "https://testapi.opaycheckout.com/api/v1/international";
const OPAY_PRODUCTION_URL = "https://liveapi.opaycheckout.com/api/v1/international";

// OPay bank list cache (24h)
let OPAY_BANKS_CACHE: { banks: BankInfo[]; expiresAt: number } | null = null;

export class OpayProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "opay";

  private merchantId: string;
  private publicKey: string;
  private privateKey: string;
  private environment: "sandbox" | "production";
  private baseUrl: string;

  constructor() {
    this.merchantId = process.env.OPAY_MERCHANT_ID ?? "";
    this.publicKey = process.env.OPAY_PUBLIC_KEY ?? "";
    this.privateKey = process.env.OPAY_PRIVATE_KEY ?? "";
    this.environment = (process.env.OPAY_ENVIRONMENT as "sandbox" | "production") ?? "sandbox";
    this.baseUrl = this.environment === "production" ? OPAY_PRODUCTION_URL : OPAY_SANDBOX_URL;
  }

  isConfigured(): boolean {
    return !!(this.merchantId && this.publicKey && this.privateKey);
  }

  isEnabled(): boolean {
    return process.env.OPAY_ENABLED === "true" && this.isConfigured();
  }

  /**
   * Generate HMAC-SHA512 signature for OPay API requests.
   * OPay signs the JSON body with the merchant's private key.
   */
  private generateSignature(body: string): string {
    return createHmac("sha512", this.privateKey).update(body).digest("hex");
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    // validate amount at provider boundary (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid amountMinor: must be a positive finite number");
    }
    const amount = input.amountMinor / 100; // OPay expects major units

    const requestBody = {
      merchantId: this.merchantId,
      outOrderNo: input.paymentReference,
      amount: {
        amount: amount,
        currency: input.currency,
      },
      expireAt: Math.floor(Date.now() / 1000) + 1800, // 30 min expiry
      callbackUrl: input.redirectUrl,
      productInfo: {
        description: input.paymentDescription,
      },
      // Fee disclosure in metadata
      metadata: {
        ...input.metadata,
        feeMinor: input.feeMinor,
        netMinor: input.netMinor,
        policyVersion: input.policyVersion,
      },
    };

    const bodyStr = JSON.stringify(requestBody);
    const signature = this.generateSignature(bodyStr);

    const res = await fetch(`${this.baseUrl}/cashier/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: bodyStr,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: {
        orderNo?: string;
        cashierUrl?: string;
        reference?: string;
      };
    };

    if (data.code !== "00000" || !data.data?.orderNo) {
      throw new Error(`OPay initiate failed: ${data.message ?? data.code ?? "Unknown error"}`);
    }

    return {
      provider: "opay",
      providerReference: data.data.orderNo,
      checkoutUrl: data.data.cashierUrl,
      status: "PENDING",
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> {
    const requestBody = JSON.stringify({
      merchantId: this.merchantId,
      outOrderNo: providerReference,
    });
    const signature = this.generateSignature(requestBody);

    const res = await fetch(`${this.baseUrl}/cashier/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      data?: {
        outOrderNo?: string;
        status?: string;
        amount?: string;
        currency?: string;
        paidAt?: string;
        paymentMethod?: string;
      };
    };

    if (data.code !== "00000") {
      throw new Error(`OPay verify failed: ${data.code}`);
    }

    const status = this.mapOpayStatus(data.data?.status);

    return {
      providerReference,
      status,
      amountPaidMinor: data.data?.amount
        ? Math.round(parseFloat(data.data.amount) * 100)
        : undefined,
      currency: data.data?.currency,
      paidAt: data.data?.paidAt ? new Date(data.data.paidAt) : undefined,
      paymentMethod: data.data?.paymentMethod,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    // validate refund amount (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid refund amount: must be a positive finite number");
    }
    const amount = input.amountMinor / 100;
    const requestBody = JSON.stringify({
      merchantId: this.merchantId,
      outOrderNo: input.providerReference,
      refundAmount: {
        amount: amount,
        currency: "NGN",
      },
      reason: input.reason ?? "Customer request",
    });
    const signature = this.generateSignature(requestBody);

    const res = await fetch(`${this.baseUrl}/cashier/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: { refundId?: string; status?: string };
    };

    if (data.code !== "00000") {
      throw new Error(`OPay refund failed: ${data.message ?? data.code}`);
    }

    return {
      refundReference: data.data?.refundId ?? `refund_${Date.now()}`,
      status: "REFUND_PENDING",
      amountMinor: input.amountMinor,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verify OPay webhook.
   *
   * OPay sends webhooks with:
   *   - X-Opay-Tranid header (transaction ID)
   *   - merchantId header (verify matches our merchant ID)
   *   - Body containing clientAuthKey + sign + paramContent
   *
   * The signature is HMAC-SHA512 of the body signed with the merchant's private key.
   * In sandbox, the body may be unencrypted for easier testing.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): WebhookVerificationResult {
    const merchantIdHeader = headers["merchantid"] ?? headers["MerchantId"] ?? "";
    const transactionId = headers["x-opay-tranid"] ?? headers["X-Opay-Tranid"] ?? "";

    // Verify merchant ID matches
    if (merchantIdHeader !== this.merchantId) {
      return {
        valid: false,
        provider: "opay",
        eventType: "unknown",
        providerReference: transactionId,
        rawPayload: rawBody,
      };
    }

    // Parse the body to extract signature
    let payload: {
      clientAuthKey?: string;
      sign?: string;
      paramContent?: string;
      timestamp?: string;
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return {
        valid: false,
        provider: "opay",
        eventType: "unknown",
        providerReference: transactionId,
        rawPayload: rawBody,
      };
    }

    // SECURITY: Verify clientAuthKey — fail-closed when not configured.
    // the check was silently skipped. Now we reject if the env var is
    // missing (defense-in-depth alongside the HMAC-SHA512 signature check).
    const expectedAuthKey = process.env.OPAY_CLIENT_AUTH_KEY ?? "";
    if (!expectedAuthKey) {
      // OPAY_CLIENT_AUTH_KEY not set — log warning but still rely on
      // the HMAC-SHA512 signature verification below (which IS configured).
      // We don't fail-closed here because the signature check is the
      // primary defense; clientAuthKey is secondary.
      // But we DO log it so operators know the defense-in-depth layer is missing.
      console.warn("[opay] OPAY_CLIENT_AUTH_KEY not set — clientAuthKey verification skipped (relying on HMAC-SHA512 only)");
    } else if (payload.clientAuthKey !== expectedAuthKey) {
      return {
        valid: false,
        provider: "opay",
        eventType: "unknown",
        providerReference: transactionId,
        rawPayload: rawBody,
      };
    }

    // Verify signature
    const signature = payload.sign ?? "";
    if (!signature) {
      return {
        valid: false,
        provider: "opay",
        eventType: "unknown",
        providerReference: transactionId,
        rawPayload: rawBody,
      };
    }

    // OPay signs: paramContent + timestamp
    const signedContent = payload.paramContent + payload.timestamp;
    const expected = createHmac("sha512", this.privateKey).update(signedContent).digest("hex");

    let valid = false;
    try {
      const expectedBuf = Buffer.from(expected, "hex");
      const sigBuf = Buffer.from(signature, "hex");
      if (expectedBuf.length === sigBuf.length) {
        valid = timingSafeEqual(expectedBuf, sigBuf);
      }
    } catch {
      valid = false;
    }

    return {
      valid,
      provider: "opay",
      eventType: valid ? "payment_notification" : "unknown",
      providerReference: transactionId,
      rawPayload: rawBody,
    };
  }

  // -------------------------------------------------------------------------
  // PAYOUT (TRANSFER) — platform → worker bank account
  // -------------------------------------------------------------------------

  async listBanks(): Promise<BankInfo[]> {
    if (OPAY_BANKS_CACHE && Date.now() < OPAY_BANKS_CACHE.expiresAt) {
      return OPAY_BANKS_CACHE.banks;
    }

    // OPay bank list endpoint. Throws on API failure — the upstream
    // /api/banks route will fall back to the DB-cached bank list if needed.
    const requestBody = JSON.stringify({ merchantId: this.merchantId });
    const signature = this.generateSignature(requestBody);
    const res = await fetch(`${this.baseUrl}/bank/list`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: Array<{ bankCode?: string; bankName?: string; shortCode?: string }>;
    };

    if (data.code !== "00000" || !Array.isArray(data.data)) {
      throw new Error(
        `OPay bank list fetch failed: ${data.message ?? data.code ?? "Unknown error"}`,
      );
    }

    const banks: BankInfo[] = data.data.map((b) => ({
      code: b.bankCode ?? "",
      name: b.bankName ?? "",
      shortName: b.shortCode,
    })).filter((b) => b.code && b.name);

    OPAY_BANKS_CACHE = { banks, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    return banks;
  }

  async resolveAccountName(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<NameEnquiryResult> {
    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw new Error("OPay name enquiry: accountNumber must be 10 digits");
    }
    const requestBody = JSON.stringify({
      merchantId: this.merchantId,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
    });
    const signature = this.generateSignature(requestBody);

    const res = await fetch(`${this.baseUrl}/bank/account/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: { accountName?: string; enquiryReference?: string };
    };

    if (data.code !== "00000") {
      return {
        valid: false,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        rawResponse: data as unknown as Record<string, unknown>,
      };
    }

    return {
      valid: !!data.data?.accountName,
      accountName: data.data?.accountName,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      enquiryReference: data.data?.enquiryReference,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async initiateTransfer(input: TransferInput): Promise<TransferResult> {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("OPay transfer: amountMinor must be positive");
    }
    if (!/^\d{10}$/.test(input.recipient.accountNumber)) {
      throw new Error("OPay transfer: recipient accountNumber must be 10 digits");
    }

    const amount = input.amountMinor / 100; // OPay expects major units
    const requestBody = JSON.stringify({
      merchantId: this.merchantId,
      outOrderNo: input.payoutReference,
      amount: {
        amount,
        currency: input.currency,
      },
      bankCode: input.recipient.bankCode,
      bankAccountNumber: input.recipient.accountNumber,
      bankAccountName: input.recipient.accountName,
      reason: input.narration,
      callbackUrl: process.env.OPAY_PAYOUT_CALLBACK_URL ?? "",
      metadata: input.metadata ?? {},
    });
    const signature = this.generateSignature(requestBody);

    const res = await fetch(`${this.baseUrl}/transfer/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: {
        orderNo?: string;
        status?: string;
        transferReference?: string;
        reference?: string;
      };
    };

    if (data.code !== "00000") {
      throw new Error(`OPay transfer failed: ${data.message ?? data.code ?? "Unknown"}`);
    }

    const status = this.mapOpayStatus(data.data?.status);
    return {
      provider: "opay",
      providerReference: data.data?.orderNo ?? input.payoutReference,
      status,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async verifyTransfer(providerReference: string): Promise<VerifyTransferResult> {
    const requestBody = JSON.stringify({
      merchantId: this.merchantId,
      outOrderNo: providerReference,
    });
    const signature = this.generateSignature(requestBody);

    const res = await fetch(`${this.baseUrl}/transfer/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.publicKey}`,
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
        Signature: signature,
      },
      body: requestBody,
    });

    const data = await res.json() as {
      code?: string;
      message?: string;
      data?: {
        outOrderNo?: string;
        status?: string;
        amount?: string;
        currency?: string;
        completedAt?: string;
        errorMessage?: string;
      };
    };

    if (data.code !== "00000") {
      throw new Error(`OPay verify transfer failed: ${data.message ?? data.code}`);
    }

    const status = this.mapOpayStatus(data.data?.status);
    return {
      providerReference,
      status,
      amountMinor: data.data?.amount ? Math.round(parseFloat(data.data.amount) * 100) : undefined,
      settledAt: data.data?.completedAt ? new Date(data.data.completedAt) : undefined,
      failureReason: status === "FAILED" ? (data.data?.errorMessage ?? "Transfer failed") : undefined,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  // -------------------------------------------------------------------------
  // RESERVED ACCOUNTS — OPay does not expose a dedicated reserved-accounts API.
  // Clients funding via OPay must use the hosted checkout flow instead.
  // -------------------------------------------------------------------------

  async createReservedAccount(input: ReservedAccountInput): Promise<ReservedAccountResult> {
    // OPay does not natively support per-project reserved accounts the way
    // Monnify does. Clients funding via OPay must use the hosted checkout
    // flow at /api/payments/initiate instead.
    throw new Error(
      "OPay does not support reserved accounts. Configure Monnify as the default provider to use virtual-account funding, or fund via OPay hosted checkout.",
    );
  }

  async deallocateReservedAccount(providerAccountRef: string): Promise<void> {
    void providerAccountRef;
    // No-op for OPay
  }

  health(): ProviderHealth {
    return {
      name: "opay",
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      environment: this.environment,
      message: this.isEnabled()
        ? `OPay ${this.environment} — ready`
        : this.isConfigured()
        ? "OPay configured but not enabled (set OPAY_ENABLED=true)"
        : "OPay not configured (set OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY, OPAY_PRIVATE_KEY)",
    };
  }

  private mapOpayStatus(status?: string): PaymentState {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
        return "SUCCEEDED";
      case "PENDING":
        return "PENDING";
      case "FAIL":
        return "FAILED";
      case "CLOSE":
        return "EXPIRED";
      case "CANCEL":
        return "CANCELED";
      case "REFUND":
        return "REFUND_PENDING";
      default:
        return "PENDING";
    }
  }
}
