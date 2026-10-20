/**
 * Password hashing tests.
 *
 * Covers:
 *   - Hash format (scrypt:N:r:p:saltHex:hashHex)
 *   - Verification of correct password
 *   - Rejection of wrong password
 *   - Different salts for the same input (no rainbow table reuse)
 *   - Password policy validation
 */
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
} from "@/lib/security/password";

describe("password hashing", () => {
  it("produces scrypt-formatted hash", () => {
    const hash = hashPassword("testpass123");
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[a-f0-9]+:[a-f0-9]+$/);
  });

  it("verifies correct password", () => {
    const hash = hashPassword("mySecretPass1");
    expect(verifyPassword("mySecretPass1", hash)).toBe(true);
  });

  it("rejects wrong password", () => {
    const hash = hashPassword("mySecretPass1");
    expect(verifyPassword("wrongPassword1", hash)).toBe(false);
  });

  it("uses different salts for the same input", () => {
    const h1 = hashPassword("samePassword1");
    const h2 = hashPassword("samePassword1");
    expect(h1).not.toBe(h2);
    expect(verifyPassword("samePassword1", h1)).toBe(true);
    expect(verifyPassword("samePassword1", h2)).toBe(true);
  });

  it("rejects empty / null inputs", () => {
    expect(verifyPassword("", hashPassword("x"))).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("anything", "scrypt:bad:format")).toBe(false);
  });
});

describe("password policy", () => {
  it("accepts strong passwords", () => {
    expect(validatePasswordPolicy("StrongPass1").ok).toBe(true);
    expect(validatePasswordPolicy("abcdefg1").ok).toBe(true);
    expect(validatePasswordPolicy("Abc12345").ok).toBe(true);
  });

  it("rejects too-short passwords", () => {
    expect(validatePasswordPolicy("Ab1").ok).toBe(false);
    expect(validatePasswordPolicy("").ok).toBe(false);
  });

  it("rejects passwords without a letter", () => {
    expect(validatePasswordPolicy("12345678").ok).toBe(false);
  });

  it("rejects passwords without a digit", () => {
    expect(validatePasswordPolicy("abcdefgH").ok).toBe(false);
  });

  it("rejects too-long passwords", () => {
    expect(validatePasswordPolicy("A1".repeat(65)).ok).toBe(false);
  });
});
