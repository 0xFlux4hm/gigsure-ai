/**
 * Fee calculation service — 1.5% platform fee (150 basis points).
 *
 * Formula: platform_fee = eligible_amount × (basis_points / 10000)
 *
 * All calculations use integer minor units (kobo for NGN).
 * No binary floating-point arithmetic is used for financial calculations.
 *
 * Rounding: round half to even (banker's rounding) at the kobo level.
 * This is the standard financial rounding rule.
 */
import { createHash } from "crypto";

export const PLATFORM_FEE_BPS_DEFAULT = 150; // 1.5% = 150 basis points

// validate PLATFORM_FEE_BPS at module load.
// A negative value would flip the fee into a CREDIT to the freelancer
// (e.g., bps=-150 → fee=-₦1,500 → freelancer gets ₦101,500 on ₦100,000).
// A value >10000 (100%) would charge more than the payment amount.
const parsedBps = parseInt(process.env.PLATFORM_FEE_BPS ?? String(PLATFORM_FEE_BPS_DEFAULT), 10);
if (!Number.isFinite(parsedBps) || parsedBps < 0 || parsedBps > 10000) {
  console.warn(`[config] PLATFORM_FEE_BPS invalid (${process.env.PLATFORM_FEE_BPS}), using default ${PLATFORM_FEE_BPS_DEFAULT}`);
}

export type FeePolicy = {
  bps: number; // basis points (150 = 1.5%)
  version: string; // policy version for audit trail
  effectiveFrom: Date;
  payer: "freelancer" | "project_owner";
};

export const CURRENT_FEE_POLICY: FeePolicy = {
  bps: Number.isFinite(parsedBps) && parsedBps >= 0 && parsedBps <= 10000
    ? parsedBps
    : PLATFORM_FEE_BPS_DEFAULT,
  version: "2026-10-v1",
  effectiveFrom: new Date("2026-10-21T00:00:00Z"),
  payer: "freelancer",
};

/**
 * Calculate the platform fee for an eligible payment amount.
 *
 * @param amountMinor - the eligible payment amount in minor units (kobo)
 * @param policy - the fee policy to apply (defaults to current policy)
 * @returns the fee in minor units, rounded to the nearest kobo (banker's rounding)
 */
export function calculateFee(
  amountMinor: number,
  policy: FeePolicy = CURRENT_FEE_POLICY,
): { feeMinor: number; rateBps: number; policyVersion: string } {
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    throw new Error("Amount must be a finite non-negative number");
  }
  if (amountMinor > Number.MAX_SAFE_INTEGER) {
    throw new Error("Amount exceeds maximum safe integer");
  }
  if (amountMinor === 0) {
    return { feeMinor: 0, rateBps: policy.bps, policyVersion: policy.version };
  }
  // fee = amount × bps / 10000
  // Use integer arithmetic: (amountMinor × bps + 5000) / 10000 for round-half-up
  // Actually, banker's rounding: round half to even
  const rawFee = amountMinor * policy.bps;
  const quotient = Math.floor(rawFee / 10000);
  const remainder = rawFee % 10000;
  let feeMinor: number;
  if (remainder > 5000) {
    feeMinor = quotient + 1;
  } else if (remainder < 5000) {
    feeMinor = quotient;
  } else {
    // Exact half — banker's rounding: round to even
    feeMinor = quotient % 2 === 0 ? quotient : quotient + 1;
  }
  return {
    feeMinor,
    rateBps: policy.bps,
    policyVersion: policy.version,
  };
}

/**
 * Calculate the net amount the freelancer receives after the platform fee.
 *
 * @param amountMinor - the total eligible payment amount in minor units
 * @param policy - the fee policy
 * @returns { feeMinor, netMinor, grossMinor }
 */
export function calculatePaymentBreakdown(
  amountMinor: number,
  policy: FeePolicy = CURRENT_FEE_POLICY,
): {
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  rateBps: number;
  policyVersion: string;
} {
  const { feeMinor, rateBps, policyVersion } = calculateFee(amountMinor, policy);
  return {
    grossMinor: amountMinor,
    feeMinor,
    netMinor: amountMinor - feeMinor,
    rateBps,
    policyVersion,
  };
}

/**
 * Validate that a fee calculation is correct (for reconciliation).
 */
export function validateFeeCalculation(
  amountMinor: number,
  expectedFeeMinor: number,
  policy: FeePolicy = CURRENT_FEE_POLICY,
): boolean {
  const { feeMinor } = calculateFee(amountMinor, policy);
  return feeMinor === expectedFeeMinor;
}

// ---------------------------------------------------------------------------
// PAYOUT FLAT FEE — outbound transfer fee (platform → service provider bank)
// ---------------------------------------------------------------------------

/**
 * Payout flat fee in minor units (kobo).
 * Default: ₦50 = 5000 kobo per outbound transfer.
 * Configurable via PAYOUT_FLAT_FEE_MINOR env var.
 */
const parsedPayoutFee = parseInt(process.env.PAYOUT_FLAT_FEE_MINOR ?? "5000", 10);
export const PAYOUT_FLAT_FEE_MINOR = Number.isFinite(parsedPayoutFee) && parsedPayoutFee >= 0
  ? parsedPayoutFee
  : 5000; // ₦50 default

/**
 * Calculate the payout flat fee for an outbound transfer.
 *
 * The fee is a flat amount per transfer (not percentage-based), deducted
 * from the service provider's payout. For very small payouts, the fee
 * is capped at 50% of the payout amount so the provider always receives
 * at least half.
 *
 * @param payoutAmountMinor - the gross payout amount before fee
 * @returns { feeMinor, netMinor } — fee deducted + net amount provider receives
 */
export function calculatePayoutFee(
  payoutAmountMinor: number,
): { feeMinor: number; netMinor: number } {
  if (!Number.isFinite(payoutAmountMinor) || payoutAmountMinor <= 0) {
    return { feeMinor: 0, netMinor: 0 };
  }
  // Cap fee at 50% of payout so small payouts aren't eaten entirely by fees.
  // Then enforce a minimum fee of ₦1 (100 kobo) for any payout ≥ ₦2.
  // For payouts < ₦2 (200 kobo), waive the minimum (too small to charge fee).
  const halfAmount = Math.floor(payoutAmountMinor / 2);
  let fee: number;
  if (payoutAmountMinor < 200) {
    // Very small payout — charge 50% (no minimum)
    fee = halfAmount;
  } else {
    // Apply minimum ₦1 floor, then 50% cap, then flat fee cap
    fee = Math.max(100, Math.min(PAYOUT_FLAT_FEE_MINOR, halfAmount));
  }
  return {
    feeMinor: fee,
    netMinor: payoutAmountMinor - fee,
  };
}
