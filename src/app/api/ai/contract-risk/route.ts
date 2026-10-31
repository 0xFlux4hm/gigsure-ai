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
import { getZai } from "@/lib/ai/zai-client";
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

  const zai = getZai();
  const maxRetries = 3;
  let analysis: RiskAnalysis | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        model: "glm-4.7-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Analyze this contract for risks:\n\n${contractText}` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        thinking: { type: "disabled" } as never,
      });

      const content = (completion as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content ?? "";
      analysis = extractJson(content);

      if (analysis) break;

      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    } catch (err) {
      const errMsg = (err as Error)?.message ?? "";
      if (attempt < maxRetries - 1 && (errMsg.includes("1305") || errMsg.includes("429"))) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  if (!analysis) {
    analysis = {
      score: 50,
      riskLevel: "MEDIUM",
      flags: [],
      summary: "AI analysis was unable to parse the contract. Please review manually or try again later.",
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
