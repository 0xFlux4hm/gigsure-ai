/**
 * Funding record service — provider-agnostic creation of FundingRecord
 * rows with idempotency.
 *
 * This module is responsible for:
 *   - Creating FundingRecord entries (type = FUNDING | RELEASE | REFUND)
 *   - Idempotency: if the same idempotencyKey was already used, the original
 *     record is returned unchanged rather than creating a duplicate.
 *   - Audit logging of the initiation event.
 *
 * It does NOT simulate provider webhooks — real providers deliver their
 * own webhooks out-of-band, which are received at /api/payments/webhook/[provider].
 * Those webhooks call confirmFundingRecord() from webhook-handler.ts to
 * advance the FundingRecord to PROVIDER_CONFIRMED and trigger payouts.
 */
import { db } from "@/lib/db";
import {
  generateProviderTxRef,
  generateIdempotencyKey,
} from "@/lib/security/tokens";
import { recordAuditEvent } from "@/lib/auth/audit";
import { PaymentProviderError } from "@/lib/payments/errors";

export type FundingType = "FUNDING" | "RELEASE" | "REFUND";
export type FundingStatus =
  | "DRAFT"
  | "INITIATED"
  | "PROVIDER_CONFIRMED"
  | "PARTIALLY_CONFIRMED"
  | "FAILED"
  | "CANCELLED"
  | "DISPUTED";

export type CreateFundingInput = {
  projectId: string;
  milestoneId?: string | null;
  type: FundingType;
  amountMinor: number;
  currency: string;
  initiatedById: string;
  provider?: string; // "monnify" | "opay" — defaults to the system default provider
  idempotencyKey?: string;
};

export type CreateFundingResult = {
  fundingRecordId: string;
  providerTxRef: string;
  status: FundingStatus;
};

/**
 * Create a FundingRecord with idempotency. If the same idempotency key has
 * already been used, returns the original record unchanged — preventing
 * duplicate financial outcomes from retried operations.
 *
 * This function ONLY writes the database record. It does NOT contact the
 * payment provider — that happens in the API route handler that calls this
 * function (e.g., POST /api/projects/[id]/funding calls provider.initiatePayment()
 * for type=FUNDING, or calls payout-service.initiatePayoutsForRelease() for
 * type=RELEASE).
 */
export async function createFundingRecord(
  input: CreateFundingInput,
): Promise<CreateFundingResult> {
  if (input.amountMinor <= 0) {
    throw new PaymentProviderError("Amount must be greater than zero", 400);
  }
  if (input.amountMinor > Number.MAX_SAFE_INTEGER) {
    throw new PaymentProviderError("Amount too large", 400);
  }

  const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
  const providerTxRef = generateProviderTxRef();
  const provider = input.provider ?? "monnify";

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
        provider,
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
        };
      }
    }
    throw err;
  }

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
      provider,
    },
  });

  return {
    fundingRecordId: record.id,
    providerTxRef,
    status: "INITIATED",
  };
}
