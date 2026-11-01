/**
 * AI Contract Risk Score.
 *
 * Analyzes a contract version and returns a 0-100 risk score with
 * specific clause flags. Useful for freelancers who can't afford a
 * lawyer to review a contract before signing.
 *
 * Returns:
 *   - score: 0-100 (higher = riskier)
 *   - riskLevel: LOW / MEDIUM / HIGH
 *   - flags: array of { clause, severity, reason, recommendation }
 *   - summary: short paragraph explaining the overall risk
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getOpenAiClient, getAiModel, aiCacheKey, aiCacheGet, aiCacheSet, type ChatMessage } from "@/lib/ai/ai-provider";
import { isPlatformAdmin } from "@/lib/auth/admin-access";
import { AuthzError } from "@/lib/auth/authorization";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  contractVersionId: z.string().cuid(),
});

type RiskFlag = {
  clause: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  recommendation: string;
};

type RiskAnalysis = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  flags: RiskFlag[];
  summary: string;
};

const SYSTEM_PROMPT = `You are GigSure's Contract Risk Analyzer. You analyze contracts for freelancers and flag risks.

You MUST respond with valid JSON only — no markdown, no explanations outside the JSON. The JSON must have this exact shape:

{
  "score": <number 0-100, higher = riskier>,
  "riskLevel": "<LOW | MEDIUM | HIGH>",
  "flags": [
    {
      "clause": "<short name of the clause, e.g. 'Liability'>",
      "severity": "<LOW | MEDIUM | HIGH>",
      "reason": "<why this is a risk, in plain language>",
      "recommendation": "<what to negotiate or change>"
    }
  ],
  "summary": "<2-3 sentence overall risk assessment>"
}

Scoring guide:
- 0-30: LOW risk. Standard terms, freelancer-friendly.
- 31-65: MEDIUM risk. Some ambiguous clauses, needs review.
- 66-100: HIGH risk. Unfair terms, unlimited liability, or missing protections.

Common risks to flag:
- Unlimited liability (freelancer bears all costs if anything goes wrong)
- No specific payment deadline (client can delay indefinitely)
- No IP ownership clarity (who owns the work?)
- One-sided termination (only client can cancel)
- No dispute resolution procedure
- Vague scope (leads to scope creep)
- No revision limits (unlimited free revisions)
- Payment only after full delivery (no milestone payments)

If the contract is empty or too short, return:
{ "score": 50, "riskLevel": "MEDIUM", "flags": [], "summary": "Contract is too brief to analyze properly. Add more detail about scope, payment, and termination." }

NEVER provide legal advice. Recommend consulting a Nigerian-qualified lawyer for binding interpretation.`;

function extractJson(content: string): RiskAnalysis | null {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end)) as RiskAnalysis;
    if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) return null;
    if (!["LOW", "MEDIUM", "HIGH"].includes(parsed.riskLevel)) return null;
    if (!Array.isArray(parsed.flags)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid request", 422);
  }

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

  const contractText = [
    `SCOPE OF WORK:\n${contract.scopeOfWork}`,
    contract.deliverables ? `\nDELIVERABLES:\n${contract.deliverables}` : "",
    contract.deadlines ? `\nDEADLINES:\n${contract.deadlines}` : "",
    contract.paymentSchedule ? `\nPAYMENT SCHEDULE:\n${contract.paymentSchedule}` : "",
    contract.milestoneConditions ? `\nMILESTONE CONDITIONS:\n${contract.milestoneConditions}` : "",
    contract.revisionRules ? `\nREVISION RULES:\n${contract.revisionRules}` : "",
    contract.cancellationTerms ? `\nCANCELLATION TERMS:\n${contract.cancellationTerms}` : "",
    contract.disputeProcedures ? `\nDISPUTE PROCEDURES:\n${contract.disputeProcedures}` : "",
  ].join("\n");

  if (contractText.trim().length < 50) {
    return {
      score: 50,
      riskLevel: "MEDIUM" as const,
      flags: [],
      summary: "Contract is too brief to analyze properly. Add more detail about scope, payment, and termination.",
    };
  }

  const model = getAiModel();
  const maxRetries = 4;
  let analysis: RiskAnalysis | null = null;

  // ─── Cache check ───────────────────────────────────────────────────
  // Both Z.AI's free glm-4.7-flash and AgentRouter have rate limits.
  // Skip the call entirely if we've already analyzed the same contract
  // text within the last 5 min.
  const cacheMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Analyze this contract for risks:\n\n${contractText}` },
  ];
  const cacheKey = await aiCacheKey(model, cacheMessages);
  const cached = aiCacheGet(cacheKey);
  if (cached) {
    // Try to parse the cached response as JSON (it was originally JSON).
    const fromCache = extractJson(cached.content);
    if (fromCache) {
      await recordAuditEvent({
        actorId: userId,
        projectId: contract.projectId,
        action: "ai.contract_risk_analysis",
        targetType: "ContractVersion",
        targetId: contract.id,
        metadata: {
          score: fromCache.score,
          riskLevel: fromCache.riskLevel,
          flagCount: fromCache.flags.length,
          cacheHit: true,
        },
      });
      return fromCache;
    }
    // If parsing failed, fall through and call the provider fresh.
  }

  const client = getOpenAiClient();
  let providerErrorMessage: string | null = null;
  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: cacheMessages,
          temperature: 0.3,
          max_tokens: 1500,
        });

        const content = (completion as { choices?: Array<{ message?: { content?: string } }> })
          ?.choices?.[0]?.message?.content ?? "";
        analysis = extractJson(content);

        if (analysis) {
          // Cache the raw response text + token count.
          const tokensUsed = (completion as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? 0;
          aiCacheSet(cacheKey, content, tokensUsed);
          break;
        }

        if (attempt < maxRetries - 1) {
          // Empty/unparseable content — retry with longer backoff.
          const backoff = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
          const jitter = (Math.random() - 0.5) * 1000;
          await new Promise((r) => setTimeout(r, backoff + jitter));
        }
      } catch (retryErr) {
        const errMsg = (retryErr as Error)?.message ?? "";
        const errStatus = (retryErr as { status?: number })?.status ?? 0;
        // Retry on rate-limit / transient errors (across providers):
        //   1302 / 1305 = Z.AI-specific codes
        //   429         = standard HTTP rate limit (both providers)
        //   500/502/503  = transient server errors
        const isRetryable =
          errMsg.includes("1302") ||
          errMsg.includes("1305") ||
          errMsg.includes("overloaded") ||
          errMsg.includes("rate_limit") ||
          errMsg.includes("429") ||
          errStatus === 429 ||
          errStatus === 500 ||
          errStatus === 502 ||
          errStatus === 503;
        if (attempt < maxRetries - 1 && isRetryable) {
          const backoff = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
          const jitter = (Math.random() - 0.5) * 1000; // ±500ms
          await new Promise((r) => setTimeout(r, backoff + jitter));
          continue;
        }
        throw retryErr;  // Re-throw on final attempt or non-retryable error
      }
    }
  } catch (err) {
    // All retries failed. Capture a friendly message + return a neutral
    // analysis object so the UI doesn't crash — the user gets actionable
    // feedback instead of a generic 500.
    const errStatus = (err as { status?: number })?.status ?? 0;
    const errMsg = (err as Error)?.message ?? "Unknown error";
    if (errStatus === 401 || errMsg.includes("401") || errMsg.toLowerCase().includes("invalid api key")) {
      providerErrorMessage =
        "AI authentication failed — the API key was rejected. If using " +
        "AgentRouter, generate a fresh key at https://agentrouter.org/console/token " +
        "(keys are often invalidated when regenerated). If using Z.AI, check " +
        "ZAI_API_KEY in Vercel env vars.";
    } else if (errMsg.includes("1302") || errMsg.includes("1305") || errMsg.includes("429") || errStatus === 429) {
      providerErrorMessage =
        "AI rate limit reached after 4 retries with backoff. Wait ~1 minute " +
        "and try again. For higher limits, switch to a paid tier (Z.AI: " +
        "AI_MODEL=glm-4.5-air; AgentRouter: check dashboard for quota).";
    } else {
      providerErrorMessage = `AI provider error: ${errMsg.slice(0, 200)}. Check Vercel function logs for details.`;
    }
  }

  if (!analysis) {
    analysis = {
      score: 50,
      riskLevel: "MEDIUM",
      flags: [],
      summary: providerErrorMessage ??
        "AI analysis was unable to parse the contract. Please review manually or try again later.",
    };
  }

  await recordAuditEvent({
    actorId: userId,
    projectId: contract.projectId,
    action: "ai.contract_risk_analysis",
    targetType: "ContractVersion",
    targetId: contract.id,
    metadata: {
      score: analysis.score,
      riskLevel: analysis.riskLevel,
      flagCount: analysis.flags.length,
    },
  });

  return analysis;
});
