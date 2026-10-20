/**
 * Password hashing utilities.
 *
 * Uses Node's built-in `scrypt` (a memory-hard KDF recommended by OWASP).
 * Hashes are stored as `scrypt:N:r:p:saltHex:hashHex` so we can later verify
 * parameters without silent migration. Never log hash strings.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 } as const;

export function hashPassword(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt.toString(
    "hex",
  )}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 6) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  try {
    const computed = scryptSync(plain, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    return computed.length === expected.length && timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

/** Password policy: 8–128 chars, at least one letter and one digit. */
export function validatePasswordPolicy(plain: string): {
  ok: boolean;
  reason?: string;
} {
  if (typeof plain !== "string") return { ok: false, reason: "Password required" };
  if (plain.length < 8) return { ok: false, reason: "Password must be at least 8 characters" };
  if (plain.length > 128) return { ok: false, reason: "Password too long" };
  if (!/[a-zA-Z]/.test(plain)) return { ok: false, reason: "Password must contain a letter" };
  if (!/[0-9]/.test(plain)) return { ok: false, reason: "Password must contain a digit" };
  return { ok: true };
}
