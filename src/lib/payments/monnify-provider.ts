/**
 * Monnify payment provider adapter.
 *
 * Official docs: https://developers.monnify.com
 *
 * Authentication:
 *   1. Base64(apiKey:secretKey) → POST /api/v1/auth/login → access token
 *   2. Bearer token for subsequent API calls
 *
 * Webhook verification:
 *   HMAC-SHA512 signature in `monnify-signature` header,
 *   signed with the API key (not secret key — verified from docs).
 *
 * Environment:
 *   Set MONNIFY_ENABLED=true, MONNIFY_ENVIRONMENT=sandbox|production
 *   Get credentials from Monnify Dashboard → Settings → API Keys & Webhooks
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
} from "./provider-interface";

const MONNIFY_SANDBOX_URL = "https://sandbox.monnify.com";
const MONNIFY_PRODUCTION_URL = "https://api.monnify.com";

// Token cache (access tokens last 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

export class MonnifyProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "monnify";

  private apiKey: string;
  private secretKey: string;
  private contractCode: string;
  private environment: "sandbox" | "production";
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.MONNIFY_API_KEY ?? "";
    this.secretKey = process.env.MONNIFY_SECRET_KEY ?? "";
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE ?? "";
    this.environment = (process.env.MONNIFY_ENVIRONMENT as "sandbox" | "production") ?? "sandbox";
    this.baseUrl = this.environment === "production" ? MONNIFY_PRODUCTION_URL : MONNIFY_SANDBOX_URL;
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.secretKey && this.contractCode);
  }

  isEnabled(): boolean {
    return process.env.MONNIFY_ENABLED === "true" && this.isConfigured();
  }

  /**
   * Get OAuth2 access token from Monnify.
   * Caches for 50 minutes (tokens expire in 60 min).
   */
  private async getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cachedToken.token;
    }

    const credentials = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Monnify auth failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      responseBody?: { accessToken?: string; expiresIn?: number };
    };

    const token = data.responseBody?.accessToken;
    if (!token) {
      throw new Error("Monnify auth: no access token in response");
    }

    cachedToken = {
      token,
      expiresAt: Date.now() + (data.responseBody?.expiresIn ?? 3600) * 1000,
    };
    return token;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    // SECURITY: validate amount at provider boundary (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid amountMinor: must be a positive finite number");
    }
    const token = await this.getAccessToken();
    const amount = input.amountMinor / 100; // Monnify expects major units

    const res = await fetch(`${this.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount,
        customerEmail: input.customerEmail,
        paymentReference: input.paymentReference,
        paymentDescription: input.paymentDescription,
        currencyCode: input.currency,
        contractCode: this.contractCode,
        redirectUrl: input.redirectUrl,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
        metadata: {
          ...input.metadata,
          feeMinor: input.feeMinor,
          netMinor: input.netMinor,
          policyVersion: input.policyVersion,
        },
      }),
    });

    const data = await res.json() as {
      requestSuccessful?: boolean;
      responseMessage?: string;
      responseCode?: string;
      responseBody?: {
        transactionReference?: string;
        paymentReference?: string;
        checkoutUrl?: string;
      };
    };

    if (!data.requestSuccessful || !data.responseBody?.transactionReference) {
      throw new Error(`Monnify initiate failed: ${data.responseMessage ?? "Unknown error"}`);
    }

    return {
      provider: "monnify",
      providerReference: data.responseBody.transactionReference,
      checkoutUrl: data.responseBody.checkoutUrl,
      status: "PENDING",
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> {
    const token = await this.getAccessToken();

    // Use the transaction reference to query status
    const res = await fetch(
      `${this.baseUrl}/api/v2/merchant/transactions/query-transaction-reference?transactionReference=${encodeURIComponent(providerReference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await res.json() as {
      responseBody?: {
        paymentReference?: string;
        paymentStatus?: string;
        amountPaid?: number;
        totalPayable?: number;
        paymentMethod?: string;
        currencyCode?: string;
        paidOn?: string;
        transactionReference?: string;
      };
    };

    const status = this.mapMonnifyStatus(data.responseBody?.paymentStatus);

    return {
      providerReference,
      status,
      amountPaidMinor: data.responseBody?.amountPaid
        ? Math.round(data.responseBody.amountPaid * 100)
        : undefined,
      currency: data.responseBody?.currencyCode,
      paidAt: data.responseBody?.paidOn ? new Date(data.responseBody.paidOn) : undefined,
      paymentMethod: data.responseBody?.paymentMethod,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    // SECURITY: validate refund amount (defense-in-depth)
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error("Invalid refund amount: must be a positive finite number");
    }
    const token = await this.getAccessToken();
    const amount = input.amountMinor / 100;

    const res = await fetch(`${this.baseUrl}/api/v1/refunds/initiate-refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionReference: input.providerReference,
        amount: amount,
        reason: input.reason ?? "Customer request",
      }),
    });

    const data = await res.json() as {
      requestSuccessful?: boolean;
      responseMessage?: string;
      responseBody?: { refundReference?: string; status?: string };
    };

    if (!data.requestSuccessful) {
      throw new Error(`Monnify refund failed: ${data.responseMessage ?? "Unknown error"}`);
    }

    return {
      refundReference: data.responseBody?.refundReference ?? `refund_${Date.now()}`,
      status: "REFUND_PENDING",
      amountMinor: input.amountMinor,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  /**
   * Verify Monnify webhook signature.
   * Monnify signs the raw request body with HMAC-SHA512 using the API key.
   * The signature is in the `monnify-signature` header.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): WebhookVerificationResult {
    const signature = headers["monnify-signature"] ?? headers["Monnify-Signature"] ?? "";

    if (!signature) {
      return {
        valid: false,
        provider: "monnify",
        eventType: "unknown",
        providerReference: "",
        rawPayload: rawBody,
      };
    }

    // Compute expected HMAC-SHA512
    const expected = createHmac("sha512", this.apiKey)
      .update(rawBody)
      .digest("hex");

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

    // Parse the payload to extract event info
    let eventType = "unknown";
    let providerReference = "";
    try {
      const payload = JSON.parse(rawBody) as {
        eventType?: string;
        eventData?: { transactionReference?: string; paymentReference?: string };
      };
      eventType = payload.eventType ?? "unknown";
      providerReference = payload.eventData?.transactionReference ?? "";
    } catch {
      // malformed JSON
    }

    return {
      valid,
      provider: "monnify",
      eventType,
      providerReference,
      rawPayload: rawBody,
    };
  }

  health(): ProviderHealth {
    return {
      name: "monnify",
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      environment: this.environment,
      message: this.isEnabled()
        ? `Monnify ${this.environment} — ready`
        : this.isConfigured()
        ? "Monnify configured but not enabled (set MONNIFY_ENABLED=true)"
        : "Monnify not configured (set MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE)",
    };
  }

  private mapMonnifyStatus(status?: string): PaymentState {
    switch (status?.toUpperCase()) {
      case "PAID":
      case "SUCCESS":
        return "SUCCEEDED";
      case "PENDING":
        return "PENDING";
      case "FAILED":
        return "FAILED";
      case "EXPIRED":
      case "CANCELLED":
        return "EXPIRED";
      case "PARTIALLY_PAID":
        return "PENDING";
      case "OVERPAID":
      case "UNDERPAID":
        return "RECONCILIATION_REQUIRED";
      default:
        return "PENDING";
    }
  }
}
