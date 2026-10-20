/**
 * Security regression tests for password hashing.
 *
 * Covers the C3 fix: verifyPassword rejects attacker-downgraded scrypt
 * parameters (e.g., N=2 which makes any password trivially hashable).
 */
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  getDecoyPasswordHash,
} from "@/lib/security/password";

describe("scrypt parameter downgrade defense (C3)", () => {
  it("rejects hashes with weak N parameter", () => {
    // Attacker tampers stored hash to N=2 — verifyPassword must reject
    const realHash = hashPassword("correctPassword1");
    const parts = realHash.split(":");
    // Tamper N to 2
    const tampered = `scrypt:2:${parts[2]}:${parts[3]}:${parts[4]}:${parts[5]}`;
    expect(verifyPassword("correctPassword1", tampered)).toBe(false);
    expect(verifyPassword("anything", tampered)).toBe(false);
  });

  it("rejects hashes with weak r parameter", () => {
    const realHash = hashPassword("correctPassword1");
    const parts = realHash.split(":");
    const tampered = `scrypt:${parts[1]}:1:${parts[3]}:${parts[4]}:${parts[5]}`;
    expect(verifyPassword("correctPassword1", tampered)).toBe(false);
  });

  it("rejects hashes with wrong keyLen", () => {
    const realHash = hashPassword("correctPassword1");
    const parts = realHash.split(":");
    // Truncate the hash to 32 hex chars (= 16 bytes) instead of 128 (64 bytes)
    const truncatedHash = parts[5].slice(0, 32);
    const tampered = `scrypt:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}:${truncatedHash}`;
    expect(verifyPassword("correctPassword1", tampered)).toBe(false);
  });

  it("rejects hashes with bad salt length", () => {
    const realHash = hashPassword("correctPassword1");
    const parts = realHash.split(":");
    // Truncate salt to 8 hex chars (= 4 bytes) instead of 32 (16 bytes)
    const truncatedSalt = parts[4].slice(0, 8);
    const tampered = `scrypt:${parts[1]}:${parts[2]}:${parts[3]}:${truncatedSalt}:${parts[5]}`;
    expect(verifyPassword("correctPassword1", tampered)).toBe(false);
  });

  it("accepts legitimate hashes (sanity check)", () => {
    const hash = hashPassword("correctPassword1");
    expect(verifyPassword("correctPassword1", hash)).toBe(true);
  });
});

describe("decoy password hash (H11 timing oracle fix)", () => {
  it("returns a valid scrypt-formatted hash", () => {
    const decoy = getDecoyPasswordHash();
    expect(decoy).toMatch(/^scrypt:\d+:\d+:\d+:[a-f0-9]+:[a-f0-9]+$/);
  });

  it("verifyPassword runs the full path on decoy (returns false but takes time)", () => {
    const decoy = getDecoyPasswordHash();
    // Should return false for any password
    expect(verifyPassword("anything1", decoy)).toBe(false);
    expect(verifyPassword("wrongPassword2", decoy)).toBe(false);
    // Should return true ONLY for the actual decoy password (which we don't expose)
    expect(verifyPassword("__decoy__", decoy)).toBe(true);
  });
});
