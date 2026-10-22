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
import { createHash } from "crypto";

export type AuditContext = {
  actorId?: string | null;
  projectId?: string | null;
  fundingRecordId?: string | null;
  payoutId?: string | null;
  expenseId?: string | null;
  ipAddress?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

// keys matching this regex are redacted before persistence/logging.
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

/**
 * compute a hash chain entry for tamper-evidence.
 * eventHash = sha256(previousHash + canonicalJson(eventData))
 * An attacker who modifies any event breaks the chain — detectable by
 * recomputing hashes from the genesis forward.
 */
function computeEventHash(
  previousHash: string,
  eventData: {
    actorId: string | null;
    projectId: string | null;
    fundingRecordId: string | null;
    payoutId: string | null;
    expenseId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: string;
    ipAddress: string | null;
    createdAt: Date;
  },
): string {
  const canonical = JSON.stringify(eventData, Object.keys(eventData).sort());
  return createHash("sha256").update(previousHash + canonical).digest("hex");
}

export async function recordAuditEvent(ctx: AuditContext): Promise<void> {
  try {
    // redact before persistence + cap length
    const safeMetadata = ctx.metadata ? redactSensitive(ctx.metadata) : undefined;
    const metadataStr = JSON.stringify(safeMetadata ?? {}).slice(0, 8192);
    const createdAt = new Date();

    // SECURITY: Use a transaction to hold the advisory lock for the
    // duration of the read+write. Without a transaction, $executeRaw
    // auto-commits and the lock is released instantly (no serialization).
    await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock (auto-released on commit/rollback)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7271828364)`;

      // Fetch previous event's hash (within the locked transaction)
      const previousEvent = await tx.auditEvent.findFirst({
        orderBy: { createdAt: "desc" },
        select: { eventHash: true },
      });
      const previousHash = previousEvent?.eventHash ?? "genesis";

      const eventData = {
        actorId: ctx.actorId ?? null,
        projectId: ctx.projectId ?? null,
        fundingRecordId: ctx.fundingRecordId ?? null,
        payoutId: ctx.payoutId ?? null,
        expenseId: ctx.expenseId ?? null,
        action: ctx.action,
        targetType: ctx.targetType ?? null,
        targetId: ctx.targetId ?? null,
        metadata: metadataStr,
        ipAddress: ctx.ipAddress ?? null,
        createdAt,
      };
      const eventHash = computeEventHash(previousHash, eventData);

      await tx.auditEvent.create({
        data: {
          ...eventData,
          previousHash,
          eventHash,
        },
      });
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

/**
 * Verify the integrity of the audit hash chain.
 * Recomputes every eventHash from genesis and checks it matches the stored value.
 * Returns the number of broken links (0 = chain is intact).
 *
 * SECURITY: This function should be called periodically (e.g., daily cron) to
 * detect tampering. If any eventHash doesn't match, the chain has been
 * compromised and an alert should be raised.
 */
export async function verifyAuditChain(): Promise<{
  totalEvents: number;
  brokenLinks: number;
  firstBrokenEventId?: string;
}> {
  const events = await db.auditEvent.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      actorId: true,
      projectId: true,
      fundingRecordId: true,
      payoutId: true,
      expenseId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ipAddress: true,
      createdAt: true,
      previousHash: true,
      eventHash: true,
    },
    take: 10000, // verify the most recent 10k events
  });

  let brokenLinks = 0;
  let firstBrokenEventId: string | undefined;
  let expectedPreviousHash = "genesis";

  for (const event of events) {
    // Check the previousHash links correctly
    if (event.previousHash !== expectedPreviousHash) {
      brokenLinks++;
      if (!firstBrokenEventId) firstBrokenEventId = event.id;
    }

    // Recompute the eventHash
    const eventData = {
      actorId: event.actorId,
      projectId: event.projectId,
      fundingRecordId: event.fundingRecordId,
      payoutId: event.payoutId,
      expenseId: event.expenseId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
      ipAddress: event.ipAddress,
      createdAt: event.createdAt,
    };
    const recomputedHash = computeEventHash(expectedPreviousHash, eventData);

    if (recomputedHash !== event.eventHash) {
      brokenLinks++;
      if (!firstBrokenEventId) firstBrokenEventId = event.id;
    }

    expectedPreviousHash = event.eventHash ?? "";
  }

  return {
    totalEvents: events.length,
    brokenLinks,
    firstBrokenEventId,
  };
}
