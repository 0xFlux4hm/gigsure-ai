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
  if (amountMinor < 0) {
    throw new Error("Amount cannot be negative");
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
