/**
 * Fee calculator tests — verifies the 1.5% platform fee.
 *
 * Formula: fee = amount × 150 / 10000 (150 bps = 1.5%)
 *
 * All amounts in kobo (minor units).
 * Rounding: banker's rounding (round half to even).
 */
import { describe, it, expect } from "vitest";
import { calculateFee, calculatePaymentBreakdown, validateFeeCalculation, CURRENT_FEE_POLICY } from "@/lib/payments/fee-calculator";

describe("Fee calculator — 1.5% (150 bps)", () => {
  it("calculates 1.5% correctly for ₦100,000", () => {
    // ₦100,000 = 10,000,000 kobo → fee should be ₦1,500 = 150,000 kobo
    const result = calculateFee(10_000_000);
    expect(result.feeMinor).toBe(150_000);
    expect(result.rateBps).toBe(150);
  });

  it("calculates 1.5% correctly for ₦250,000", () => {
    // ₦250,000 = 25,000,000 kobo → fee should be ₦3,750 = 375,000 kobo
    const result = calculateFee(25_000_000);
    expect(result.feeMinor).toBe(375_000);
  });

  it("calculates 1.5% correctly for ₦500,000", () => {
    // ₦500,000 = 50,000,000 kobo → fee should be ₦7,500 = 750,000 kobo
    const result = calculateFee(50_000_000);
    expect(result.feeMinor).toBe(750_000);
  });

  it("calculates 1.5% correctly for ₦1,000,000", () => {
    // ₦1,000,000 = 100,000,000 kobo → fee should be ₦15,000 = 1,500,000 kobo
    const result = calculateFee(100_000_000);
    expect(result.feeMinor).toBe(1_500_000);
  });

  it("handles zero amount", () => {
    const result = calculateFee(0);
    expect(result.feeMinor).toBe(0);
  });

  it("handles small amounts (₦1 = 100 kobo)", () => {
    // 100 kobo × 150 / 10000 = 1.5 kobo → banker's rounding → 2 kobo (round half to even)
    const result = calculateFee(100);
    expect(result.feeMinor).toBe(2); // 1.5 rounds to 2 (even)
  });

  it("handles ₦100 (10,000 kobo)", () => {
    // 10,000 × 150 / 10000 = 150 kobo = ₦1.50
    const result = calculateFee(10_000);
    expect(result.feeMinor).toBe(150);
  });

  it("records the policy version", () => {
    const result = calculateFee(10_000_000);
    expect(result.policyVersion).toBe(CURRENT_FEE_POLICY.version);
  });

  it("rejects negative amounts", () => {
    expect(() => calculateFee(-100)).toThrow("Amount cannot be negative");
  });
});

describe("Payment breakdown", () => {
  it("calculates gross, fee, and net correctly", () => {
    const breakdown = calculatePaymentBreakdown(10_000_000); // ₦100,000
    expect(breakdown.grossMinor).toBe(10_000_000);
    expect(breakdown.feeMinor).toBe(150_000);  // ₦1,500
    expect(breakdown.netMinor).toBe(9_850_000); // ₦9,850
  });

  it("net + fee = gross", () => {
    for (const amount of [100, 1000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000]) {
      const breakdown = calculatePaymentBreakdown(amount);
      expect(breakdown.feeMinor + breakdown.netMinor).toBe(breakdown.grossMinor);
    }
  });

  it("fee is always ≤ 1.5% of gross + 1 kobo (rounding tolerance)", () => {
    // For very small amounts, rounding can cause the fee rate to slightly
    // exceed 1.5% by up to 1 kobo. This is expected and acceptable.
    for (const amount of [100, 1000, 10_000, 100_000, 1_000_000, 10_000_000]) {
      const breakdown = calculatePaymentBreakdown(amount);
      const maxFee = Math.ceil(amount * 0.015); // ceiling of exact 1.5%
      expect(breakdown.feeMinor).toBeLessThanOrEqual(maxFee + 1); // +1 kobo rounding tolerance
    }
  });
});

describe("Fee validation (for reconciliation)", () => {
  it("validates correct fee calculations", () => {
    expect(validateFeeCalculation(10_000_000, 150_000)).toBe(true);
    expect(validateFeeCalculation(25_000_000, 375_000)).toBe(true);
    expect(validateFeeCalculation(50_000_000, 750_000)).toBe(true);
  });

  it("rejects incorrect fee calculations", () => {
    expect(validateFeeCalculation(10_000_000, 149_999)).toBe(false);
    expect(validateFeeCalculation(10_000_000, 150_001)).toBe(false);
    expect(validateFeeCalculation(10_000_000, 0)).toBe(false);
  });
});
