import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 } as const;

// Precomputed decoy hash for non-existent users, so login timing is uniform.
// Produced by hashPassword("__decoy__"). Format is valid so verifyPassword
// runs the full scryptSync path even when the user doesn't exist.
const DECOY_HASH = hashPasswordInternal("__decoy__", SCRYPT_PARAMS);

export function hashPassword(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  if (plain.length > 1024) {
    // Defense in depth against DoS via huge password buffers.
    // validatePasswordPolicy enforces 8-128 chars at the API layer.
    throw new Error("Password too long");
  }
  return hashPasswordInternal(plain, SCRYPT_PARAMS);
}

function hashPasswordInternal(plain: string, params: typeof SCRYPT_PARAMS): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${params.N}:${params.r}:${params.p}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  // cap password length to prevent DoS via huge passwords
  // (scryptSync runs the full PBKDF2 phase over every byte of `plain`).
  if (typeof plain !== "string" || plain.length === 0 || plain.length > 1024) return false;
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 6) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");

  // reject attacker-downgraded hash parameters.
  // Only accept hashes that match our SCRYPT_PARAMS, so a DB-tamper attack
  // that replaces a victim's hash with scrypt:2:1:1:... can't succeed.
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (N !== SCRYPT_PARAMS.N || r !== SCRYPT_PARAMS.r || p !== SCRYPT_PARAMS.p) return false;
  if (expected.length !== SCRYPT_PARAMS.keyLen) return false;
  if (salt.length !== 16) return false;

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

/** Returns a valid scrypt-formatted decoy hash for use when a user lookup misses. */
export function getDecoyPasswordHash(): string {
  return DECOY_HASH;
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
