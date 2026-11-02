/**
 * AI Milestone Generator.
 *
 * POST /api/ai/milestones
 * Body: { projectTitle: string, scopeOfWork: string, fundingArrangement:
 *        FULL | MILESTONE | UPFRONT_PLUS_MILESTONES, projectId: string,
 *        totalBudgetHint?: string, timelineWeeksHint?: number }
 * Returns: { plan: MilestonePlan, advisoryOnly: true, tokensUsed: number, raw: string }
 *
 * Suggested milestones are advisory. The customer + worker must review and
 * explicitly agree to each one. AI never invents actual payment amounts —
 * only percentages.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { generateMilestonePlan } from "@/lib/ai/groq";
import { sanitizeForAI } from "@/lib/security/sanitize-ai";
import { z } from "zod";

const Schema = z.object({
  projectId: z.string().cuid(),
  projectTitle: z.string().min(3).max(160),
  scopeOfWork: z.string().min(20).max(8000),
  fundingArrangement: z.enum(["FULL", "MILESTONE", "UPFRONT_PLUS_MILESTONES"]),
  totalBudgetHint: z.string().max(100).optional(), // text — we never invent actual amounts
  timelineWeeksHint: z.number().int().min(1).max(52).optional(),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userLimit = await checkRateLimit(`ai:milestones:user:${userId}`, RATE_LIMITS.AI_ASSISTANT_PER_USER);
  const ipLimit = await checkRateLimit(`ai:milestones:ip:${ip}`, RATE_LIMITS.AI_ASSISTANT_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) {
    return fail("Rate limit exceeded. Please wait a moment and try again.", 429);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid request", 422);
  }

  // Verify project membership — milestone plans are project-scoped
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: parsed.data.projectId, userId } },
  });
  if (!membership || membership.revokedAt) {
    return fail("Not a member of this project", 403);
  }

  const sanitizedTitle = sanitizeForAI(parsed.data.projectTitle);
  const sanitizedScope = sanitizeForAI(parsed.data.scopeOfWork);

  try {
    const { plan, raw, tokensUsed } = await generateMilestonePlan({
      projectTitle: sanitizedTitle,
      scopeOfWork: sanitizedScope,
      fundingArrangement: parsed.data.fundingArrangement,
      totalBudgetHint: parsed.data.totalBudgetHint ? sanitizeForAI(parsed.data.totalBudgetHint) : undefined,
      timelineWeeksHint: parsed.data.timelineWeeksHint,
    });

    if (!plan) {
      logSecurityEvent("warn", "ai.parse_failed", {
        feature: "milestone_plan",
        userId,
        rawPreview: sanitizeForAI(raw.slice(0, 200)),
      });
      return fail("AI returned an invalid response. Please try again.", 502);
    }

    await recordAuditEvent({
      actorId: userId,
      projectId: parsed.data.projectId,
      action: "ai.milestone_plan_generated",
      targetType: "Project",
      targetId: parsed.data.projectId,
      metadata: {
        milestoneCount: plan.milestones.length,
        fundingArrangement: plan.fundingArrangement,
        totalWeeks: plan.totalWeeks,
        tokensUsed,
      },
    });

    return { plan, advisoryOnly: true, tokensUsed, raw };
  } catch (err) {
    const errMsg = (err as Error)?.message ?? "Unknown error";
    const errStatus = (err as { status?: number })?.status ?? 0;
    logSecurityEvent("warn", "ai.provider_error", {
      feature: "milestone_plan",
      message: sanitizeForAI(errMsg.slice(0, 500)),
      status: errStatus,
      userId,
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
