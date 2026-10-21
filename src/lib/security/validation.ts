/**
 * Input validation utilities — last line of defense before data hits the database.
 */
const SUPPORTED_CURRENCIES = new Set(["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"]);

// tightened email regex — no more accepting Unicode
// homoglyphs (Cyrillic а, Greek о) or control characters (NULL, BEL, etc.).
// Matches the common ASCII subset of RFC 5322 (local part: alphanumeric + !#$%&'*+/=?^_`{|}~-])
// and a basic domain pattern (alphanumeric + hyphens + dots).
// Rejects: Unicode chars, control chars, Bidi overrides, homoglyphs.
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const DISPLAY_NAME_RE = /^[\p{L}\p{M}\p{Z}\p{N}\p{P}~`&'^_\-+.() ]+$/u;

export function normalizeEmail(email: string): string {
  return (email ?? "").toString()
    // strip control characters (NULL, BEL, BS, etc.)
    // that could be used for log injection or DB-string truncation attacks.
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, "")
    .trim()
    .toLowerCase();
}

export function validateEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const e = normalizeEmail(email);
  if (e.length < 5 || e.length > 254) return false;
  return EMAIL_RE.test(e);
}

export function sanitizeDisplayName(name: string): string {
  if (typeof name !== "string") return "";
  const cleaned = name
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, "")
    .replace(/[<>]/g, "")
    .trim();
  if (cleaned.length === 0 || cleaned.length > 80) return "";
  if (!DISPLAY_NAME_RE.test(cleaned)) return "";
  return cleaned;
}

export function validateCurrency(code: string): boolean {
  return typeof code === "string" && SUPPORTED_CURRENCIES.has(code.toUpperCase());
}

export function amountToMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid amount");
  }
  const decimals = currencyDecimals(currency);
  const minor = Math.round(amount * 10 ** decimals);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Amount too large");
  }
  return minor;
}

export function minorToAmount(minor: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  return minor / 10 ** decimals;
}

export function currencyDecimals(currency: string): number {
  const c = currency.toUpperCase();
  if (c === "JPY") return 0;
  return 2;
}

export function safeParseInt(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : null;
  }
  return null;
}

export function safeParseJSON<T = unknown>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function safeBasename(name: string): string {
  if (typeof name !== "string") return "file";
  const base = name.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\.+/g, ".").replace(/^\.+/, "").trim();
  return base.length > 0 ? base.slice(0, 255) : "file";
}

const ALLOWED_UPLOAD_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/markdown",
]);

export function isAllowedUploadMime(mime: string): boolean {
  return ALLOWED_UPLOAD_MIMES.has(mime);
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB

export function isSafeRedirect(target: string | undefined | null): boolean {
  if (!target) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return false;
  if (target.startsWith("//")) return false;
  if (target.startsWith("\\")) return false;
  if (target.includes("\n") || target.includes("\r")) return false;
  return target.startsWith("/") || target.startsWith("?");
}
