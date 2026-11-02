/**
 * AI Project Brief Generator.
 *
 * POST /api/ai/project-brief
 * Body: { description: string, projectId?: string }
 * Returns: { brief: ProjectBrief, advisoryOnly: true, tokensUsed: number, raw: string }
 *
 * The brief is advisory — the user reviews and edits before saving.
 * No project is created automatically.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { generateProjectBrief } from "@/lib/ai/groq";
import { sanitizeForAI } from "@/lib/security/sanitize-ai";
import { z } from "zod";

const Schema = z.object({
  description: z.string().min(20, "Description must be at least 20 characters").max(8000),
  projectId: z.string().cuid().optional(),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userLimit = await checkRateLimit(`ai:brief:user:${userId}`, RATE_LIMITS.AI_ASSISTANT_PER_USER);
  const ipLimit = await checkRateLimit(`ai:brief:ip:${ip}`, RATE_LIMITS.AI_ASSISTANT_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) {
    return fail(
      "Rate limit exceeded. Please wait a moment and try again.",
      429,
      { retryAfter: Math.max(userLimit.resetAt, ipLimit.resetAt) - Date.now() },
    );
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid request — description must be 20-8000 characters", 422);
  }

  // Optional: verify project membership if projectId is provided
  if (parsed.data.projectId) {
    const membership = await db.projectMembership.findUnique({
      where: { projectId_userId: { projectId: parsed.data.projectId, userId } },
    });
    if (!membership || membership.revokedAt) {
      return fail("Not a member of this project", 403);
    }
  }

  const sanitizedDescription = sanitizeForAI(parsed.data.description);

  try {
    const { brief, raw, tokensUsed } = await generateProjectBrief(sanitizedDescription);

    if (!brief) {
      logSecurityEvent("warn", "ai.parse_failed", {
        feature: "project_brief",
        userId,
        rawPreview: sanitizeForAI(raw.slice(0, 200)),
      });
      return fail("AI returned an invalid response. Please try again.", 502);
    }

    await recordAuditEvent({
      actorId: userId,
      projectId: parsed.data.projectId,
      action: "ai.project_brief_generated",
      targetType: "Project",
      targetId: parsed.data.projectId ?? "draft",
      metadata: {
        complexity: brief.complexity,
        timelineWeeks: brief.estimatedTimelineWeeks,
        deliverableCount: brief.deliverables.length,
        tokensUsed,
      },
    });

    return { brief, advisoryOnly: true, tokensUsed, raw };
  } catch (err) {
    const errMsg = (err as Error)?.message ?? "Unknown error";
    const errStatus = (err as { status?: number })?.status ?? 0;
    logSecurityEvent("warn", "ai.provider_error", {
      feature: "project_brief",
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
