/**
 * AI Contract Analysis (Enhanced — supersedes /api/ai/contract-risk).
 *
 * POST /api/ai/contract-analysis
 * Body: { contractVersionId: string }  OR  { contractText: string }
 * Returns: { analysis: ContractAnalysis, advisoryOnly: true, tokensUsed: number, raw: string }
 *
 * Identifies: missing info, ambiguous obligations, unclear deliverables,
 * missing acceptance criteria, unspecified deadlines, payment
 * inconsistencies, conflicting clauses, completion conditions.
 *
 * NEVER provides legal advice. Recommends consulting a Nigerian-qualified
 * lawyer for binding interpretation.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { analyzeContract } from "@/lib/ai/groq";
import { sanitizeForAI } from "@/lib/security/sanitize-ai";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
import { AuthzError } from "@/lib/auth/authorization";
import { z } from "zod";

const Schema = z.object({
  contractVersionId: z.string().cuid().optional(),
  contractText: z.string().min(50).max(20000).optional(),
}).refine((d) => d.contractVersionId || d.contractText, {
  message: "Either contractVersionId or contractText must be provided",
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userLimit = await checkRateLimit(`ai:contract:user:${userId}`, RATE_LIMITS.AI_ASSISTANT_PER_USER);
  const ipLimit = await checkRateLimit(`ai:contract:ip:${ip}`, RATE_LIMITS.AI_ASSISTANT_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) {
    return fail("Rate limit exceeded. Please wait a moment and try again.", 429);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid request — provide contractVersionId or contractText (50-20000 chars)", 422);
  }

  let contractText = "";
  let projectId: string | undefined;
  let contractId: string | undefined;

  if (parsed.data.contractVersionId) {
    // Load from database — verify membership
    const contract = await db.contractVersion.findUnique({
      where: { id: parsed.data.contractVersionId },
      include: { project: { include: { memberships: true } } },
    });
    if (!contract) {
      return fail("Contract version not found", 404);
    }

    const membership = contract.project.memberships.find(
      (m) => m.userId === userId && !m.revokedAt,
    );
    const isAdmin = await isPlatformAdmin(userId);
    if (!membership && !isAdmin) {
      throw new AuthzError("Not a member of this project", 403);
    }

    contractId = contract.id;
    projectId = contract.projectId;

    contractText = [
      `SCOPE OF WORK:\n${contract.scopeOfWork}`,
      contract.deliverables ? `\nDELIVERABLES:\n${contract.deliverables}` : "",
      contract.deadlines ? `\nDEADLINES:\n${contract.deadlines}` : "",
      contract.paymentSchedule ? `\nPAYMENT SCHEDULE:\n${contract.paymentSchedule}` : "",
      contract.milestoneConditions ? `\nMILESTONE CONDITIONS:\n${contract.milestoneConditions}` : "",
      contract.revisionRules ? `\nREVISION RULES:\n${contract.revisionRules}` : "",
      contract.cancellationTerms ? `\nCANCELLATION TERMS:\n${contract.cancellationTerms}` : "",
      contract.disputeProcedures ? `\nDISPUTE PROCEDURES:\n${contract.disputeProcedures}` : "",
    ].join("\n");
  } else if (parsed.data.contractText) {
    contractText = parsed.data.contractText;
  }

  if (contractText.trim().length < 50) {
    return fail("Contract text is too brief to analyze. Add more detail.", 422);
  }

  const sanitized = sanitizeForAI(contractText);

  try {
    const { analysis, raw, tokensUsed } = await analyzeContract(sanitized);

    if (!analysis) {
      logSecurityEvent("warn", "ai.parse_failed", {
        feature: "contract_analysis",
        userId,
        rawPreview: sanitizeForAI(raw.slice(0, 200)),
      });
      return fail("AI returned an invalid response. Please try again.", 502);
    }

    await recordAuditEvent({
      actorId: userId,
      projectId,
      action: "ai.contract_analysis",
      targetType: "ContractVersion",
      targetId: contractId ?? "adhoc",
      metadata: {
        score: analysis.score,
        riskLevel: analysis.riskLevel,
        flagCount: analysis.flags.length,
        missingInfoCount: analysis.missingInformation.length,
        tokensUsed,
      },
    });

    return { analysis, advisoryOnly: true, tokensUsed, raw };
  } catch (err) {
    const errMsg = (err as Error)?.message ?? "Unknown error";
    const errStatus = (err as { status?: number })?.status ?? 0;
    logSecurityEvent("warn", "ai.provider_error", {
      feature: "contract_analysis",
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
