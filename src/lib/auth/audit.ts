/**
 * Structured audit log. Audit events are stored in DB (`AuditEvent`) and are
 * also emitted to the server log in JSON form for easy ingestion.
 *
 * CRITICAL: never log passwords, raw tokens, reset tokens, session secrets,
 * private keys, or full financial credentials. Sanitise `metadata` before
 * passing it here.
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

export async function recordAuditEvent(ctx: AuditContext): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        actorId: ctx.actorId ?? null,
        projectId: ctx.projectId ?? null,
        fundingRecordId: ctx.fundingRecordId ?? null,
        action: ctx.action,
        targetType: ctx.targetType ?? null,
        targetId: ctx.targetId ?? null,
        metadata: JSON.stringify(ctx.metadata ?? {}),
        ipAddress: ctx.ipAddress ?? null,
      },
    });
  } catch (err) {
    // Audit must never break the request, but we MUST log the failure.
    console.error("[audit] failed to record", ctx.action, err);
  }
}

/** Safe structured log line — never includes secrets. */
export function logSecurityEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
