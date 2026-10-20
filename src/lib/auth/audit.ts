/**
 * Structured audit log. Audit events are stored in DB (`AuditEvent`) and are
 * also emitted to the server log in JSON form for easy ingestion.
 *
 * CRITICAL: never log passwords, raw tokens, reset tokens, session secrets,
 * private keys, or full financial credentials. The `redactSensitive` helper
 * below is applied automatically to all `metadata` and `fields` to provide
 * defense-in-depth — even if a future caller forgets to sanitise.
 */
import { db } from "@/lib/db";

export type AuditContext = {
  actorId?: string | null;
  projectId?: string | null;
  fundingRecordId?: string | null;
  ipAddress?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

// SECURITY: keys matching this regex are redacted before persistence/logging.
// We split each key by camelCase + non-letter boundaries, then check if any
// resulting token matches a sensitive word. This catches:
//   password, Password, PASSWORD
//   csrfToken, csrf_token, CSRF_TOKEN
//   clientSecret, client_secret, CLIENT_SECRET
//   refreshToken, refresh_token
//   apiKey, api_key, API_KEY
//   sessionToken, session_token
//   webhookSecret, webhook_secret
// but NOT: tokenize, keyboard, passwordless (compound words split correctly)
const SENSITIVE_WORDS = new Set([
  "token", "password", "passwd", "secret", "hash", "signature",
  "authorization", "csrf", "session", "refresh", "apikey",
  "privatekey", "clientsecret", "webhooksecret", "key",
]);

function isSensitiveKey(key: string): boolean {
  // Split on non-alphanumeric separators AND camelCase boundaries.
  // Examples:
  //   "csrfToken" → ["csrf", "Token"] → ["csrf", "token"]
  //   "csrf_token" → ["csrf", "token"]
  //   "API_KEY" → ["API", "KEY"]
  //   "APIKey" → ["API", "Key"] (acronyms handled)
  //   "apiKey" → ["api", "Key"]
  // We use the regex /([A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+)/g
  // to tokenize without splitting inside acronyms.
  const parts = key
    .match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g)
    ?.map((p) => p.toLowerCase()) ?? [];
  for (const part of parts) {
    if (SENSITIVE_WORDS.has(part)) return true;
  }
  return false;
}

/**
 * Recursively walk an object and replace values of sensitive keys with
 * "[REDACTED]". Returns a deep clone so the caller's original object is
 * not mutated.
 */
export function redactSensitive<T>(input: T): T {
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map(redactSensitive) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSensitive(v);
    }
  }
  return out as T;
}

export async function recordAuditEvent(ctx: AuditContext): Promise<void> {
  try {
    // SECURITY: redact before persistence — defense-in-depth so a future
    // caller that forgets to sanitise doesn't leak secrets to the audit log.
    const safeMetadata = ctx.metadata ? redactSensitive(ctx.metadata) : undefined;
    await db.auditEvent.create({
      data: {
        actorId: ctx.actorId ?? null,
        projectId: ctx.projectId ?? null,
        fundingRecordId: ctx.fundingRecordId ?? null,
        action: ctx.action,
        targetType: ctx.targetType ?? null,
        targetId: ctx.targetId ?? null,
        metadata: JSON.stringify(safeMetadata ?? {}),
        ipAddress: ctx.ipAddress ?? null,
      },
    });
  } catch (err) {
    // Audit must never break the request, but we MUST log the failure.
    console.error("[audit] failed to record", ctx.action, err);
  }
}

/** Safe structured log line — sanitised + never includes raw secrets. */
export function logSecurityEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields?: Record<string, unknown>,
): void {
  const safeFields = fields ? redactSensitive(fields) : undefined;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...safeFields,
  });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
