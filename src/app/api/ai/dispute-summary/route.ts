/**
 * AI Dispute Summary (Neutral — for resolution assistance).
 *
 * POST /api/ai/dispute-summary
 * Body: { disputeId: string }
 * Returns: { summary: DisputeSummary, advisoryOnly: true, tokensUsed: number, raw: string }
 *
 * Generates a NEUTRAL summary of the dispute using authorized records:
 *   - Original contract / agreed deliverables
 *   - Submitted work + milestones status
 *   - Dispute messages between parties
 *
 * CRITICAL: AI NEVER decides disputes, releases funds, freezes accounts,
 * or authorizes payments. Output is documentation only. Human review is
 * mandatory.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { generateDisputeSummary } from "@/lib/ai/groq";
import { sanitizeForAI, sanitizeContextField, deepSanitize } from "@/lib/security/sanitize-ai";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
import { AuthzError } from "@/lib/auth/authorization";

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userLimit = await checkRateLimit(`ai:dispute:user:${userId}`, RATE_LIMITS.AI_ASSISTANT_PER_USER);
  const ipLimit = await checkRateLimit(`ai:dispute:ip:${ip}`, RATE_LIMITS.AI_ASSISTANT_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) {
    return fail("Rate limit exceeded. Please wait a moment and try again.", 429);
  }

  // Parse disputeId from query string or body
  const url = new URL(req.url);
  const disputeId = (await req.text().then((t) => {
    try { return JSON.parse(t).disputeId; } catch { return undefined; }
  }).catch(() => undefined)) ?? url.searchParams.get("disputeId");

  if (!disputeId || typeof disputeId !== "string") {
    return fail("disputeId is required", 422);
  }

  // Load dispute + verify project membership
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      project: {
        include: {
          memberships: { where: { revokedAt: null }, select: { userId: true, role: true } },
          contracts: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { scopeOfWork: true, deliverables: true, deadlines: true, paymentSchedule: true },
          },
          milestones: {
            select: {
              title: true, status: true, amountMinor: true,
              tasks: { select: { title: true, status: true } },
              fundingRecords: { select: { type: true, status: true, amountMinor: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50,  // Cap to control token usage
        select: { body: true, createdAt: true, authorId: true },
      },
    },
  });

  if (!dispute) {
    return fail("Dispute not found", 404);
  }

  // Verify membership
  const membership = dispute.project.memberships.find((m) => m.userId === userId);
  const isAdmin = await isPlatformAdmin(userId);
  if (!membership && !isAdmin) {
    throw new AuthzError("Not a member of this project", 403);
  }

  // Build dispute records text — minimize PII, only authorized data
  const rawRecords = {
    dispute: {
      title: dispute.title,
      category: dispute.category,
      status: dispute.status,
      description: dispute.description,
      openedAt: dispute.createdAt,
    },
    agreedDeliverables: dispute.project.contracts[0] ?? null,
    milestones: dispute.project.milestones,
    messages: dispute.messages.map((m) => ({
      // Don't include authorId — replace with role for neutrality
      authorRole: dispute.project.memberships.find((mem) => mem.userId === m.authorId)?.role ?? "participant",
      sentAt: m.createdAt,
      body: m.body,
    })),
  };

  // Deep-sanitize: strip PII + injection patterns from every string field
  const sanitizedRecords = deepSanitize(rawRecords);
  const recordsText = JSON.stringify(sanitizedRecords, null, 2);

  try {
    const { summary, raw, tokensUsed } = await generateDisputeSummary(recordsText);

    if (!summary) {
      logSecurityEvent("warn", "ai.parse_failed", {
        feature: "dispute_summary",
        userId,
        disputeId,
        rawPreview: sanitizeForAI(raw.slice(0, 200)),
      });
      return fail("AI returned an invalid response. Please try again.", 502);
    }

    await recordAuditEvent({
      actorId: userId,
      projectId: dispute.projectId,
      action: "ai.dispute_summary_generated",
      targetType: "Dispute",
      targetId: dispute.id,
      metadata: {
        timelineEvents: summary.timeline.length,
        gaps: summary.gaps.length,
        tokensUsed,
      },
    });

    return { summary, advisoryOnly: true, tokensUsed, raw };
  } catch (err) {
    const errMsg = (err as Error)?.message ?? "Unknown error";
    const errStatus = (err as { status?: number })?.status ?? 0;
    logSecurityEvent("warn", "ai.provider_error", {
      feature: "dispute_summary",
      message: sanitizeForAI(errMsg.slice(0, 500)),
      status: errStatus,
      userId,
      disputeId,
    });

    if (errStatus === 401) {
      return fail("AI authentication failed. Check that your AI provider API key is set correctly in Vercel env vars.", 503);
    }
    if (errStatus === 429 || errMsg.includes("429") || errMsg.includes("1302")) {
      return fail("AI rate limit reached. Wait ~60 seconds for the per-minute quota to reset, then try again.", 429);
    }
    return fail(`AI request failed: ${sanitizeForAI(errMsg.slice(0, 200))}`, 502);
  }
});

// Suppress unused import warning — sanitizeContextField is re-exported via deepSanitize
void sanitizeContextField;
