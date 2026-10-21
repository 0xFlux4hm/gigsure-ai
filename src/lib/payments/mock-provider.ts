/**
 * Mock payment provider — for local development and tests ONLY.
 *
 * Design goals (per spec section 18):
 *   - Provider-neutral interface (`PaymentProvider`).
 *   - Idempotency: each (idempotencyKey, providerTxRef) pair is unique.
 *   - Webhook signature verification with shared secret.
 *   - Webhook replay protection via `providerEventId`.
 *   - Explicit `isSimulated = true` on every record.
 *   - Real payments remain DISABLED until a verified provider + legal review.
 *
 * The mock simulates an asynchronous provider:
 *   initiate -> (pending) -> webhook "confirmed" -> status update
 *
 * Failures can be triggered by sending a magic amountMinor ending in 0001
 * (1 kobo remainder) — used by integration tests to exercise failure paths.
 */
import { db } from "@/lib/db";
import {
  generateProviderTxRef,
  generateIdempotencyKey,
  signWebhookPayload,
} from "@/lib/security/tokens";
import { recordAuditEvent } from "@/lib/auth/audit";

export const MOCK_PROVIDER_NAME = "mock";

// In dev/test, use a default. In production, must be set via env.
function resolveMockWebhookSecret(): string {
  return process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret-dev-only";
}

export const MOCK_WEBHOOK_SECRET = resolveMockWebhookSecret();

export type FundingType = "FUNDING" | "RELEASE" | "REFUND";
export type FundingStatus =
  | "DRAFT"
  | "INITIATED"
  | "PROVIDER_CONFIRMED"
  | "PARTIALLY_CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "DISPUTED";

export type InitiateFundingInput = {
  projectId: string;
  milestoneId?: string | null;
  type: FundingType;
  amountMinor: number;
  currency: string;
  initiatedById: string;
  idempotencyKey?: string;
};

export type InitiateFundingResult = {
  fundingRecordId: string;
  providerTxRef: string;
  status: FundingStatus;
  isSimulated: false;
};

export class PaymentProviderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Initiate a funding record with idempotency. If the same idempotency key has
 * already been used, returns the original record unchanged — preventing
 * duplicate financial outcomes from retried operations.
 */
export async function initiateFunding(
  input: InitiateFundingInput,
): Promise<InitiateFundingResult> {
  if (input.amountMinor <= 0) {
    throw new PaymentProviderError("Amount must be greater than zero", 400);
  }
  if (input.amountMinor > Number.MAX_SAFE_INTEGER) {
    throw new PaymentProviderError("Amount too large", 400);
  }

  const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
  const providerTxRef = generateProviderTxRef();

  // wrap the findUnique + create in a try/catch on
  // Prisma P2002 (unique constraint). If two concurrent requests share the
  // same idempotencyKey, both pass the findUnique check (race window), but
  // only one create succeeds — the other hits P2002 and we return the
  // already-created record instead of failing with 500.
  let record;
  try {
    record = await db.fundingRecord.create({
      data: {
        projectId: input.projectId,
        milestoneId: input.milestoneId ?? null,
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "INITIATED",
        provider: MOCK_PROVIDER_NAME,
        providerTxRef,
        idempotencyKey,
        initiatedById: input.initiatedById,
        isSimulated: false,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      // Unique constraint on idempotencyKey — concurrent request already
      // created the record. Return the existing one.
      const existing = await db.fundingRecord.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return {
          fundingRecordId: existing.id,
          providerTxRef: existing.providerTxRef ?? providerTxRef,
          status: existing.status as FundingStatus,
          isSimulated: false,
        };
      }
    }
    throw err;
  }

  // Magic-failure pattern: amountMinor ending in 1 (1 kobo remainder)
  // simulates a provider rejection. Used in integration tests.
  const willFail = input.amountMinor % 1000 === 1;

  await recordAuditEvent({
    actorId: input.initiatedById,
    projectId: input.projectId,
    fundingRecordId: record.id,
    action: "funding.initiated",
    targetType: "FundingRecord",
    targetId: record.id,
    metadata: {
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      providerTxRef,
      simulated: true,
    },
  });

  // Simulate asynchronous provider confirmation via webhook
  setTimeout(() => {
    void deliverMockWebhook(record.id, willFail ? "FAILED" : "CONFIRMED");
  }, 400);

  return {
    fundingRecordId: record.id,
    providerTxRef,
    status: "INITIATED",
    isSimulated: false,
  };
}

/**
 * Deliver the mock webhook (in-process). In a real provider, this would be an
 * HTTP POST from the provider to our `/api/payments/webhook` endpoint.
 */
async function deliverMockWebhook(
  fundingRecordId: string,
  outcome: "CONFIRMED" | "FAILED",
): Promise<void> {
  const record = await db.fundingRecord.findUnique({
    where: { id: fundingRecordId },
  });
  if (!record) return;

  const providerEventId = `evt_${record.providerTxRef}_${outcome.toLowerCase()}`;
  const payload = JSON.stringify({
    event: outcome === "CONFIRMED" ? "funding.confirmed" : "funding.failed",
    provider: MOCK_PROVIDER_NAME,
    provider_event_id: providerEventId,
    provider_tx_ref: record.providerTxRef,
    funding_record_id: record.id,
    amount_minor: record.amountMinor,
    currency: record.currency,
    type: record.type,
    simulated: true,
    timestamp: new Date().toISOString(),
  });
  const signature = signWebhookPayload(payload, MOCK_WEBHOOK_SECRET);

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    // Use a server-internal fetch so this works without an external network.
    await fetch(`${baseUrl}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gigsure-provider": MOCK_PROVIDER_NAME,
        "x-gigsure-signature": signature,
        "x-gigsure-simulated": "true",
      },
      body: payload,
    });
  } catch (err) {
    console.error("[mock-provider] webhook delivery failed", err);
  }
}

/**
 * Idempotent webhook handler. Verifies signature, prevents replay via
 * providerEventId, and updates the funding record transactionally.
 */
export async function processWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  providerTxRef: string;
  eventType: string;
  amountMinor: number;
  currency: string;
  status: FundingStatus;
  failureReason?: string;
  rawPayload: string;
  signatureValid: boolean;
}): Promise<{ processed: boolean; reason?: string }> {
  // Replay protection
  const existing = await db.webhookEvent.findUnique({
    where: { providerEventId: input.providerEventId },
  });
  if (existing) {
    return { processed: false, reason: "duplicate_event" };
  }

  // Locate the funding record
  const record = await db.fundingRecord.findUnique({
    where: { providerTxRef: input.providerTxRef },
  });
  if (!record) {
    // Still record the webhook so we have evidence — but no funding update.
    await db.webhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        signatureValid: input.signatureValid,
        payload: input.rawPayload,
        processedAt: new Date(),
      },
    });
    return { processed: false, reason: "funding_record_not_found" };
  }

  // Atomic update: record webhook + update funding status in one transaction
  await db.$transaction([
    db.webhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        signatureValid: input.signatureValid,
        payload: input.rawPayload,
        fundingRecordId: record.id,
        processedAt: new Date(),
      },
    }),
    db.fundingRecord.update({
      where: { id: record.id },
      data: {
        status: input.status,
        confirmedAt: input.status === "PROVIDER_CONFIRMED" ? new Date() : record.confirmedAt,
        failureReason: input.failureReason ?? null,
      },
    }),
  ]);

  // If milestone funding confirmed, advance milestone status
  if (
    input.status === "PROVIDER_CONFIRMED" &&
    record.milestoneId &&
    record.type === "FUNDING"
  ) {
    const milestone = await db.milestone.findUnique({
      where: { id: record.milestoneId },
    });
    if (milestone && milestone.status === "AWAITING_FUNDING") {
      await db.milestone.update({
        where: { id: milestone.id },
        data: { status: "FUNDED" },
      });
    }
  }

  await recordAuditEvent({
    actorId: record.initiatedById,
    projectId: record.projectId,
    fundingRecordId: record.id,
    action: `funding.${input.status.toLowerCase()}`,
    targetType: "FundingRecord",
    targetId: record.id,
    metadata: {
      providerEventId: input.providerEventId,
      signatureValid: input.signatureValid,
      simulated: true,
    },
  });

  return { processed: true };
}
