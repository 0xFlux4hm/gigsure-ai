import { createHmac } from "crypto";
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
import { PaymentProviderError } from "./errors";

const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const PAYPAL_PRODUCTION_API_BASE = "https://api-m.paypal.com";

// Token cache (access tokens last ~1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * PayPal Order API v2 response shape — only the fields we use.
 * https://developer.paypal.com/docs/api/orders/v2/#orders-get-response
 */
interface PayPalOrderResponse {
  id: string; // PAYID-XXXXXXXXX
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  intent: "CAPTURE" | "AUTHORIZE";
  purchase_units: Array<{
    reference_id?: string;
    amount: { currency_code: string; value: string };
    payments?: {
      captures?: Array<{
        id: string;
        status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED";
        amount: { currency_code: string; value: string };
        create_time: string;
      }>;
    };
  }>;
  links: Array<{ href: string; rel: string; method: string }>;
}

interface PayPalAccessTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: "Bearer";
}

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource: {
    id: string; // order/capture ID
    parent_payment?: string; // legacy field — order ID for some events
    amount?: { total: string; currency: string };
    create_time?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
  create_time: string;
}

interface PayPalVerifyWebhookResponse {
  verification_status: "SUCCESS" | "FAILURE";
}

export class PayPalProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "paypal";

  private get env(): "sandbox" | "production" {
    return (process.env.PAYPAL_ENVIRONMENT ?? "sandbox") === "production"
      ? "production"
      : "sandbox";
  }

  private get baseUrl(): string {
    return this.env === "production" ? PAYPAL_PRODUCTION_API_BASE : PAYPAL_SANDBOX_API_BASE;
  }

  isConfigured(): boolean {
    return !!(
      process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET
    );
  }

  isEnabled(): boolean {
    return process.env.PAYPAL_ENABLED === "true" && this.isConfigured();
  }

  // -------------------------------------------------------------------------
  // OAuth 2.0 access token (cached for 50 min, refreshes 10 min before expiry)
  // -------------------------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 10 * 60 * 1000) {
      return cachedToken.token;
    }

    if (!this.isConfigured()) {
      throw new PaymentProviderError(
        "PayPal credentials not set. Configure PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET.",
        503,
      );
    }

    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
    ).toString("base64");

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new PaymentProviderError(
        `PayPal auth failed: ${res.status} ${text.slice(0, 200)}`,
        502,
      );
    }

    const data = (await res.json()) as PayPalAccessTokenResponse;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  }

  // -------------------------------------------------------------------------
  // Map PayPal status → GigSure PaymentState
  // -------------------------------------------------------------------------

  private mapStatus(paypalStatus: PayPalOrderResponse["status"]): PaymentState {
    switch (paypalStatus) {
      case "CREATED":
      case "SAVED":
        return "CREATED";
      case "APPROVED":
      case "PAYER_ACTION_REQUIRED":
        return "REQUIRES_ACTION";
      case "COMPLETED":
        return "SUCCEEDED";
      case "VOIDED":
        return "CANCELED";
      default:
        return "PENDING";
    }
  }

  // -------------------------------------------------------------------------
  // Inbound: client → platform
  // -------------------------------------------------------------------------

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const token = await this.getAccessToken();

    // create the PayPal order in USD at a fixed demo rate (1 USD = 1500 NGN).
    // In production, this would use a live FX rate API.
    const isCrossBorder = input.currency === "NGN";
    const paypalCurrency = isCrossBorder ? "USD" : input.currency;
    const fxRate = isCrossBorder ? 1500 : 1; // 1 USD = 1500 NGN (demo rate)
    const paypalAmountMinor = isCrossBorder
      ? Math.round(input.amountMinor / fxRate)
      : input.amountMinor;

    const paypalAmount = (paypalAmountMinor / 100).toFixed(2);

    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.paymentReference,
          amount: {
            currency_code: paypalCurrency,
            value: paypalAmount,
          },
          description: input.paymentDescription.slice(0, 127),
        },
      ],
      application_context: {
        brand_name: "GigSure AI",
        user_action: "PAY_NOW",
        return_url: input.redirectUrl,
        cancel_url: input.redirectUrl,
        shipping_preference: "NO_SHIPPING",
      },
    };

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": input.paymentReference,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new PaymentProviderError(
        `PayPal create order failed: ${res.status} ${text.slice(0, 300)}`,
        502,
      );
    }

    const data = (await res.json()) as PayPalOrderResponse;
    const approveLink = data.links.find((l) => l.rel === "approve")?.href;

    return {
      provider: "paypal",
      providerReference: data.id,
      checkoutUrl: approveLink,
      status: this.mapStatus(data.status),
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async verifyPayment(providerReference: string): Promise<VerifyPaymentResult> {
    const token = await this.getAccessToken();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${providerReference}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new PaymentProviderError(
        `PayPal fetch order failed: ${res.status} ${text.slice(0, 200)}`,
        502,
      );
    }

    let data = (await res.json()) as PayPalOrderResponse;

    // If the order is APPROVED (buyer approved in PayPal but we haven't
    // captured yet), capture the payment now.
    if (data.status === "APPROVED") {
      const captureRes = await fetch(
        `${this.baseUrl}/v2/checkout/orders/${providerReference}/capture`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": `capture_${providerReference}`,
          },
        },
      );
      if (captureRes.ok) {
        data = (await captureRes.json()) as PayPalOrderResponse;
      } else {
        // Log the capture failure so we can diagnose
        const errText = await captureRes.text();
        console.error(`[PayPal] Capture failed: ${captureRes.status} ${errText.slice(0, 300)}`);
      }
    }

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

    // Get the raw PayPal capture amount (in USD for cross-border, or the
    // original currency for same-currency payments)
    const rawAmountMinor = capture
      ? Math.round(parseFloat(capture.amount.value) * 100)
      : undefined;
    const rawCurrency = capture?.amount.currency_code;

    // For cross-border (USD capture for an NGN project), convert to NGN
    // so the rest of the platform works unchanged.
    const isCrossBorder = rawCurrency === "USD";
    const amountPaidMinor = isCrossBorder && rawAmountMinor
      ? rawAmountMinor * 1500  // USD minor → NGN minor (1 USD = ₦1500 demo rate)
      : rawAmountMinor;

    return {
      providerReference: data.id,
      status: this.mapStatus(data.status),
      amountPaidMinor,
      currency: isCrossBorder ? "NGN" : rawCurrency,
      paidAt: capture?.create_time ? new Date(capture.create_time) : undefined,
      paymentMethod: "paypal",
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    const token = await this.getAccessToken();

    // First, fetch the order to get the capture ID
    const orderRes = await fetch(`${this.baseUrl}/v2/checkout/orders/${input.providerReference}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!orderRes.ok) {
      throw new PaymentProviderError(
        `PayPal fetch order (for refund) failed: ${orderRes.status}`,
        502,
      );
    }
    const orderData = (await orderRes.json()) as PayPalOrderResponse;
    const capture = orderData.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      throw new PaymentProviderError(
        "PayPal order has no captured payment to refund",
        400,
      );
    }

    // Refund amount (major units string)
    const refundAmount = (input.amountMinor / 100).toFixed(2);

    const res = await fetch(`${this.baseUrl}/v2/payments/captures/${capture.id}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { value: refundAmount, currency_code: capture.amount.currency_code },
        note_to_payer: input.reason?.slice(0, 255) ?? undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new PaymentProviderError(
        `PayPal refund failed: ${res.status} ${text.slice(0, 200)}`,
        502,
      );
    }

    const refundData = (await res.json()) as {
      id: string;
      status: "PENDING" | "COMPLETED" | "FAILED";
      amount: { value: string; currency_code: string };
    };

    return {
      refundReference: refundData.id,
      status:
        refundData.status === "COMPLETED" ? "SUCCEEDED"
        : refundData.status === "PENDING" ? "REFUND_PENDING"
        : "FAILED",
      amountMinor: Math.round(parseFloat(refundData.amount.value) * 100),
      rawResponse: refundData as unknown as Record<string, unknown>,
    };
  }

  // -------------------------------------------------------------------------
  // Webhook verification (PayPal official verification API)
  // -------------------------------------------------------------------------

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      // SECURITY: if no webhook ID is configured, treat all webhooks as invalid.
      // We never want to silently accept unverified webhooks — they could be
      // forged to fake payment confirmations.
      return {
        valid: false,
        provider: "paypal",
        eventType: "UNKNOWN",
        providerReference: "",
        rawPayload: rawBody,
      };
    }

    // Parse the event to extract the event_type + order reference for the
    // result (regardless of verification outcome).
    let event: PayPalWebhookEvent | null = null;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      // Malformed JSON — invalid webhook
      return {
        valid: false,
        provider: "paypal",
        eventType: "MALFORMED",
        providerReference: "",
        rawPayload: rawBody,
      };
    }

    // Call PayPal's official verification API
    const token = await this.getAccessToken();
    const verifyRes = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"] ?? "",
        cert_url: headers["paypal-cert-url"] ?? "",
        transmission_id: headers["paypal-transmission-id"] ?? "",
        transmission_sig: headers["paypal-transmission-sig"] ?? "",
        transmission_time: headers["paypal-transmission-time"] ?? "",
        webhook_id: webhookId,
        webhook_event: event,
      }),
    });

    if (!verifyRes.ok) {
      // PayPal verification endpoint itself failed — fail safe
      return {
        valid: false,
        provider: "paypal",
        eventType: event.event_type ?? "UNKNOWN",
        providerReference: event.resource?.id ?? "",
        rawPayload: rawBody,
      };
    }

    const verifyData = (await verifyRes.json()) as PayPalVerifyWebhookResponse;

    // Extract the order ID for the result — PayPal puts it in different places
    // depending on the event version:
    //   1. resource.supplementary_data.related_ids.order_id (v2 captures — preferred)
    //   2. resource.parent_payment (legacy v1 sales)
    //   3. resource.id (the capture ID itself — last resort, used as a fallback
    //      but may not match the order ID we stored at initiation time)
    //   4. links[].href where rel="up" — contains the order ID in the URL path
    let orderId =
      event.resource?.supplementary_data?.related_ids?.order_id ??
      event.resource?.parent_payment ??
      event.resource?.id ??
      "";

    // If we still don't have an order ID, try to extract it from the links array
    // PayPal includes a link with rel="up" pointing to the order, e.g.:
    //   "href": "https://api.sandbox.paypal.com/v2/checkout/orders/8EC322402D808574K"
    const eventAny = event as unknown as {
      links?: Array<{ rel?: string; href?: string }>;
      resource?: { links?: Array<{ rel?: string; href?: string }> };
    };
    if (!orderId && eventAny.links && Array.isArray(eventAny.links)) {
      const upLink = eventAny.links.find((l) => l.rel === "up" || l.rel === "self");
      if (upLink?.href) {
        const match = upLink.href.match(/\/orders\/([A-Z0-9]+)/);
        if (match) orderId = match[1];
      }
    }

    // Also check resource.links for the order reference
    if (!orderId && eventAny.resource?.links && Array.isArray(eventAny.resource.links)) {
      const orderLink = eventAny.resource.links.find(
        (l) => l.rel === "up" && l.href?.includes("/orders/"),
      );
      if (orderLink?.href) {
        const match = orderLink.href.match(/\/orders\/([A-Z0-9]+)/);
        if (match) orderId = match[1];
      }
    }

    return {
      valid: verifyData.verification_status === "SUCCESS",
      provider: "paypal",
      eventType: event.event_type ?? "UNKNOWN",
      providerReference: orderId,
      rawPayload: rawBody,
    };
  }

  health(): ProviderHealth {
    return {
      name: "paypal",
      enabled: this.isEnabled(),
      configured: this.isConfigured(),
      environment: this.env,
      message: this.isEnabled()
        ? `PayPal ${this.env} connected`
        : this.isConfigured()
          ? "PayPal configured but disabled (set PAYPAL_ENABLED=true)"
          : "PayPal not configured (set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET)",
    };
  }
}
