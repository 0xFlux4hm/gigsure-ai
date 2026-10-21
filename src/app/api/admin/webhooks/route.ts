/**
 * Admin: webhook delivery log.
 *
 * Used for diagnosing payment provider integration issues
 * (invalid signatures, replay attempts, unprocessed events).
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt, getQueryParam } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";

export const GET = apiRoute(async (req) => {
  await requireAdminRateLimited();

  const limit = Math.min(getQueryInt(req, "limit", 100), 500);
  const offset = getQueryInt(req, "offset", 0);
  const provider = getQueryParam(req, "provider");
  const signatureValid = getQueryParam(req, "signatureValid");
  const unprocessedOnly = getQueryParam(req, "unprocessed") === "true";

  const where: Record<string, unknown> = {};
  if (provider) where.provider = provider;
  if (signatureValid === "true") where.signatureValid = true;
  if (signatureValid === "false") where.signatureValid = false;
  if (unprocessedOnly) where.processedAt = null;

  const [events, total, invalidCount, unprocessedCount, byProvider] = await Promise.all([
    db.webhookEvent.findMany({
      where,
      include: {
        fundingRecord: {
          select: {
            id: true,
            providerTxRef: true,
            status: true,
            amountMinor: true,
            currency: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.webhookEvent.count({ where }),
    db.webhookEvent.count({ where: { signatureValid: false } }),
    db.webhookEvent.count({ where: { processedAt: null } }),
    db.webhookEvent.groupBy({
      by: ["provider"],
      _count: { provider: true },
    }),
  ]);

  return {
    events,
    total,
    limit,
    offset,
    aggregates: {
      invalidSignatureCount: invalidCount,
      unprocessedCount,
      byProvider: byProvider.map((p) => ({ provider: p.provider, count: p._count.provider })),
    },
  };
});
