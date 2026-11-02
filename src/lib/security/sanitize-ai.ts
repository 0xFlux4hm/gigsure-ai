/**
 * Sanitization for AI prompts.
 *
 * Strips PII + prompt-injection patterns from user-supplied text before
 * it's sent to the AI provider. This is the SHARED version of the helpers
 * that were originally duplicated in src/app/api/ai/assistant/route.ts.
 *
 * All GigSure AI routes should call sanitizeForAI() on user-controlled
 * input before forwarding to the LLM.
 */

/**
 * Strip PII + dangerous Unicode from input destined for the LLM.
 * - Strips control chars + zero-width + bidi-override (homograph defense)
 * - Redacts JWTs, emails, phones, BVN/NIN, cards, IBANs
 * - Caps length at 8000 chars
 */
export function sanitizeForAI(input: string): string {
  return input
    // Strip control chars + zero-width + bidi-override first (defense against
    // homograph attacks + RTL/LTR override that hides injected instructions)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E]/g, "")
    // JWT — case-insensitive base64url after the literal "eyJ"
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]")
    // Also catch base64-encoded JWTs (attacker wraps JWT in base64 to bypass regex)
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (m) => {
      try {
        const d = Buffer.from(m, "base64").toString("utf8");
        return /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(d) ? "[REDACTED_JWT_B64]" : m;
      } catch {
        return m;
      }
    })
    // Email — case-insensitive (catches lowercase variants)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, "[REDACTED_EMAIL]")
    // Nigerian phone — accepts separators (spaces, dashes, dots)
    .replace(/(?:\+?234|0)[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/g, "[REDACTED_PHONE]")
    .replace(/\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[REDACTED_PHONE]")
    // Nigerian-specific: BVN (11 digits) + NIN (11 digits) — explicitly tagged
    .replace(/\b\d{11}\b/g, "[REDACTED_NGN_ID]")
    // Card — accepts 13-19 digits with separators (Amex 15, Diners 14, Visa/MC 16, Maestro 16-19)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[REDACTED_CARD]")
    // IBAN — case-insensitive (catches lowercase variants)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/gi, "[REDACTED_IBAN]")
    .slice(0, 8000);
}

/**
 * Sanitize a context field (e.g. dispute description, contract text).
 *
 * Applies sanitizeForAI first, then strips instruction-shaped lines that
 * could be prompt-injection attacks embedded in project records.
 */
export function sanitizeContextField(s: string): string {
  if (typeof s !== "string") return s;
  // First apply the standard PII sanitization
  let out = sanitizeForAI(s);
  // Then strip instruction-shaped lines (case-insensitive)
  out = out
    // Strip lines that look like system overrides (multiline + case-insensitive)
    .replace(/^\s*(system|assistant|admin|ignore|disregard|override|new instructions?)[:\-\s]/gim, "[FILTERED] $1:")
    // Strip "end of context/instructions" style control tokens (case-insensitive)
    .replace(/\b(end of (context|instructions?|prompt|system|data)|stop sequence)\b/gi, "[FILTERED]")
    // Strip "ignore previous" / "disregard above" patterns (case-insensitive)
    .replace(/\b(ignore (?:all |the )?previous|disregard (?:all |the )?(?:above|prior|previous))\b/gi, "[FILTERED]")
    // Per-field cap to prevent context bloat attacks (a 50KB dispute description
    // could be used to drown the LLM in noise so it ignores the actual prompt)
    .slice(0, 2000);
  return out;
}

/**
 * Deep-sanitize an object: walk every string field, apply sanitizeContextField.
 * Used on the assembled context object before JSON.stringify.
 */
export function deepSanitize(obj: unknown): unknown {
  if (typeof obj === "string") return sanitizeContextField(obj);
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj instanceof Date) return obj;
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, deepSanitize(v)]),
    );
  }
  return obj;
}
