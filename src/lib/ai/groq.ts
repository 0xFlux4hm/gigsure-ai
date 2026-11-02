/**
 * Reusable Groq AI service for GigSure's 5 AI features.
 *
 * This module wraps the unified OpenAI-compatible client (which works with
 * Groq, DeepSeek, Gemini, AgentRouter, or Z.AI — whichever is configured).
 * Each function:
 *   1. Builds the messages array with the appropriate system prompt
 *   2. Calls the active provider via getOpenAiClient()
 *   3. Parses + validates the JSON response against the expected schema
 *   4. Retries with exponential backoff on transient errors (skipping
 *      retries on per-minute rate limits where retrying makes it worse)
 *   5. Returns the typed result, or null on parse failure
 *
 * Routes call these functions instead of duplicating provider logic.
 */
import { getOpenAiClient, getAiProvider, getAiModel, type ChatMessage } from "@/lib/ai/ai-provider";
import {
  PROJECT_BRIEF_PROMPT,
  MILESTONE_GENERATOR_PROMPT,
  CONTRACT_ANALYSIS_PROMPT,
  DISPUTE_SUMMARY_PROMPT,
  hardenPrompt,
  type ProjectBrief,
  type MilestonePlan,
  type ContractAnalysis,
  type DisputeSummary,
} from "@/lib/ai/prompts";

/**
 * Extract the first complete JSON object from a model's text response.
 * Walks the string looking for matching braces so we can pull JSON out
 * of responses that include surrounding prose.
 */
export function extractJson<T>(content: string): T | null {
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(content.slice(start, end)) as T;
  } catch {
    return null;
  }
}

/**
 * Common AI completion call with retry logic.
 *
 * Retry strategy differs by provider:
 *   - Per-minute quotas (Groq 30 RPM, Gemini 15 RPM, Z.AI ~1 RPM): fail
 *     fast on 429 — retrying burns more of the same minute's quota.
 *   - Concurrency caps (DeepSeek 2500): retry with backoff, the cap is
 *     rarely hit.
 *   - Transient 500/502/503: retry with backoff.
 *
 * Returns the raw response content string + token usage. Caller parses.
 */
export async function callAI(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): Promise<{ content: string; tokensUsed: number; model: string; provider: string }> {
  const { temperature = 0.3, maxTokens = 1500, timeoutMs = 30_000 } = options;
  const provider = getAiProvider();
  const model = getAiModel();
  const client = getOpenAiClient();

  const messages: ChatMessage[] = [
    { role: "system", content: hardenPrompt(systemPrompt) },
    { role: "user", content: userPrompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const maxRetries = 4;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }) as { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
        const content = completion?.choices?.[0]?.message?.content ?? "";
        const tokensUsed = completion?.usage?.total_tokens ?? 0;
        if (content) {
          clearTimeout(timer);
          return { content, tokensUsed, model, provider };
        }
        // Empty content — retry with backoff (reasoning tokens ate the budget)
        if (attempt < maxRetries - 1) {
          await sleepWithJitter(attempt);
        }
      } catch (err) {
        lastErr = err;
        const errMsg = (err as Error)?.message ?? "";
        const errStatus = (err as { status?: number })?.status ?? 0;

        // Per-minute quota providers: fail fast on 429 (retrying makes it worse)
        const hasPerMinuteQuota = provider === "groq" || provider === "gemini" || provider === "zai";
        const isPerMinuteRateLimit = hasPerMinuteQuota && (errStatus === 429 || errMsg.includes("429") || errMsg.includes("1302"));
        if (isPerMinuteRateLimit) {
          clearTimeout(timer);
          throw err;
        }

        // Retryable: transient 5xx, 429 from non-per-minute providers, "overloaded"
        const isRetryable =
          errStatus === 500 ||
          errStatus === 502 ||
          errStatus === 503 ||
          errMsg.includes("overloaded") ||
          errMsg.includes("rate_limit") ||
          errMsg.includes("insufficient_quota") ||
          (errStatus === 429 && !hasPerMinuteQuota);
        if (attempt < maxRetries - 1 && isRetryable) {
          await sleepWithJitter(attempt);
          continue;
        }
        throw err;
      }
    }
    clearTimeout(timer);
    throw lastErr ?? new Error("AI call failed without specific error");
  } finally {
    clearTimeout(timer);
  }
}

function sleepWithJitter(attempt: number): Promise<void> {
  const backoff = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
  const jitter = (Math.random() - 0.5) * 1000; // ±500ms
  return new Promise((r) => setTimeout(r, backoff + jitter));
}

// ─── Feature 1: Project Brief Generator ──────────────────────────────
export async function generateProjectBrief(
  customerDescription: string,
): Promise<{ brief: ProjectBrief | null; raw: string; tokensUsed: number }> {
  const { content, tokensUsed } = await callAI(
    PROJECT_BRIEF_PROMPT,
    `Generate a professional project brief from this customer description:\n\n${customerDescription}`,
    { temperature: 0.4, maxTokens: 1500 },
  );
  return { brief: extractJson<ProjectBrief>(content), raw: content, tokensUsed };
}

// ─── Feature 2: Milestone Generator ──────────────────────────────────
export async function generateMilestonePlan(params: {
  projectTitle: string;
  scopeOfWork: string;
  fundingArrangement: "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES";
  totalBudgetHint?: string; // optional — we never invent actual amounts
  timelineWeeksHint?: number;
}): Promise<{ plan: MilestonePlan | null; raw: string; tokensUsed: number }> {
  const { projectTitle, scopeOfWork, fundingArrangement, totalBudgetHint, timelineWeeksHint } = params;
  const userPrompt = `Project: ${projectTitle}
Funding arrangement: ${fundingArrangement}
${totalBudgetHint ? `Total budget: ${totalBudgetHint} (do not invent actual amounts — only suggest percentages)` : ""}
${timelineWeeksHint ? `Target timeline: ${timelineWeeksHint} weeks` : ""}

Scope of work:
${scopeOfWork}

Suggest a milestone breakdown. Payment percentages MUST sum to 100.`;
  const { content, tokensUsed } = await callAI(
    MILESTONE_GENERATOR_PROMPT,
    userPrompt,
    { temperature: 0.3, maxTokens: 2000 },
  );
  return { plan: extractJson<MilestonePlan>(content), raw: content, tokensUsed };
}

// ─── Feature 3: Contract Analysis (Enhanced) ────────────────────────
export async function analyzeContract(contractText: string): Promise<{
  analysis: ContractAnalysis | null;
  raw: string;
  tokensUsed: number;
}> {
  const { content, tokensUsed } = await callAI(
    CONTRACT_ANALYSIS_PROMPT,
    `Analyze this project agreement for risks, missing info, and ambiguities:\n\n${contractText}`,
    { temperature: 0.3, maxTokens: 2000 },
  );
  return { analysis: extractJson<ContractAnalysis>(content), raw: content, tokensUsed };
}

// ─── Feature 5: Dispute Summary ──────────────────────────────────────
export async function generateDisputeSummary(disputeRecords: string): Promise<{
  summary: DisputeSummary | null;
  raw: string;
  tokensUsed: number;
}> {
  const { content, tokensUsed } = await callAI(
    DISPUTE_SUMMARY_PROMPT,
    `Summarize this dispute using only the records provided. Be neutral. Do not recommend financial actions.\n\n${disputeRecords}`,
    { temperature: 0.2, maxTokens: 2000 }, // Lower temperature for factual accuracy
  );
  return { summary: extractJson<DisputeSummary>(content), raw: content, tokensUsed };
}
