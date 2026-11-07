/**
 * Conversational AI project builder.
 *
 * Lets an authenticated user describe a project in natural language and
 * get back a structured, editable project proposal. The AI may ask
 * clarifying questions before producing a proposal. The proposal is
 * NEVER created directly — the client must POST the approved data to
 * the EXISTING /api/projects endpoint (and optionally /contracts,
 * /milestones, /tasks), which enforce the same authorization, validation,
 * audit logging, and lifecycle states as manual creation.
 *
 * This endpoint does NOT call the 9 existing assistants internally —
 * the client orchestrates them as needed (Project Brief Helper, Task
 * Planner, etc.) via the existing /api/ai/assistant endpoint. This
 * endpoint focuses on the conversational clarification + structured
 * proposal generation, returning strict JSON.
 *
 * Security:
 *   - requireUserId() (any authenticated user can create a project —
 *     matches POST /api/projects which has no project:create permission)
 *   - aiFeatureDisclosure consent gate (same as /api/ai/assistant)
 *   - per-user + per-IP rate limit
 *   - all user input sanitized before reaching the LLM
 *   - AI output re-validated by Zod (treated as untrusted)
 *   - provider error detail logged server-side only; client gets a
 *     generic message
 *   - AiActivity persisted + audit event recorded
 */
import {
  getOpenAiClient,
  getAiModel,
  type ChatMessage,
} from "@/lib/ai/ai-provider";
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const RequestSchema = z.object({
  // Conversation thread. The most recent message is the latest user turn.
  messages: z.array(MessageSchema).min(1).max(20),
});

// The structured project proposal the AI may return.
const ProjectProposalSchema = z.object({
  kind: z.literal("proposal"),
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(8000),
  objectives: z.array(z.string().max(300)).max(20).optional().default([]),
  requirements: z.array(z.string().max(300)).max(30).optional().default([]),
  scopeOfWork: z.string().max(4000).optional().default(""),
  deliverables: z.array(z.string().max(300)).max(30).optional().default([]),
  proposedTasks: z.array(z.string().max(200)).max(30).optional().default([]),
  dependencies: z.array(z.string().max(200)).max(15).optional().default([]),
  suggestedTimelineWeeks: z.number().int().min(1).max(52).nullable().optional(),
  // Suggested budget in MAJOR units of the chosen currency (e.g. NGN 500000
  // means ₦500,000). The client reviews + edits before creation.
  suggestedBudget: z.number().int().min(0).nullable().optional(),
  suggestedMilestones: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        description: z.string().max(4000).optional().default(""),
        deliverables: z.array(z.string().max(300)).max(10).optional().default([]),
        dueDate: z.string().nullable().optional(),
        // Suggested milestone amount in MAJOR units. For MILESTONE funding,
        // the sum of milestone amounts should roughly equal the total budget.
        suggestedAmount: z.number().int().min(0).nullable().optional(),
      }),
    )
    .max(15)
    .optional()
    .default([]),
  draftAgreement: z
    .object({
      scopeOfWork: z.string().max(20000).optional().default(""),
      deliverables: z.array(z.string().max(500)).max(50).optional().default([]),
      deadlines: z.string().max(4000).optional().default(""),
      paymentSchedule: z.string().max(8000).optional().default(""),
      milestoneConditions: z.string().max(4000).optional().default(""),
      revisionRules: z.string().max(4000).optional().default(""),
      cancellationTerms: z.string().max(4000).optional().default(""),
      disputeProcedures: z.string().max(4000).optional().default(""),
    })
    .optional(),
  fundingArrangement: z.enum(["FULL", "MILESTONE", "UPFRONT_PLUS_MILESTONES"]).optional().default("MILESTONE"),
  currency: z.string().max(8).optional().default("NGN"),
  potentialRisks: z.array(z.string().max(300)).max(15).optional().default([]),
  // Plain-language summary the client shows above the structured preview
  summary: z.string().max(800).optional().default(""),
  // Fields the AI explicitly flagged as assumptions made (not asked).
  // CRITICAL: every assumption must be listed here so the client can verify.
  assumptions: z.array(z.string().max(200)).max(15).optional().default([]),
  // Fields the client should still confirm (only when truly necessary)
  missingInformation: z.array(z.string().max(200)).max(5).optional().default([]),
});

// If the AI needs more information, it returns a clarifying question instead.
const ClarifyingQuestionSchema = z.object({
  kind: z.literal("clarify"),
  question: z.string().min(1).max(800),
});

const AIResponseSchema = z.discriminatedUnion("kind", [
  ProjectProposalSchema,
  ClarifyingQuestionSchema,
]);

type ProjectBuilderResponse =
  | { kind: "proposal"; proposal: z.infer<typeof ProjectProposalSchema> }
  | { kind: "clarify"; question: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Sanitization (matches /api/ai/assistant pattern)
// ---------------------------------------------------------------------------

function sanitizeForAI(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 4000);
}

// ---------------------------------------------------------------------------
// System prompt — instructs the AI to return strict JSON
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are GigSure's AI Project Builder. You help clients turn natural-language ideas into clear, structured project proposals.

CORE PRINCIPLE: Generate first, ask fewer questions.

When a client describes what they want to build:
1. Immediately generate a COMPLETE project proposal.
2. Make reasonable assumptions for any missing details.
3. List every assumption you made in the "assumptions" field so the client can verify them.
4. Only ask a clarifying question in the rare case where the request is so vague that you cannot produce a usable proposal (e.g. "build something" with no other detail). In that case ask exactly ONE focused question. Otherwise, always generate.

You MUST respond with a single JSON object and nothing else. No Markdown, no code fences, no commentary outside the JSON. The JSON must match exactly one of these shapes:

To ask ONE clarifying question (ONLY when the request is truly unworkable):
{
  "kind": "clarify",
  "question": "One short, focused question (max 1-2 sentences)."
}

To produce a project proposal (DEFAULT — use this almost always):
{
  "kind": "proposal",
  "title": "Concise project title (3-12 words)",
  "description": "2-4 paragraph project description. Plain text, no Markdown.",
  "objectives": ["Objective 1", "Objective 2"],
  "requirements": ["Specific requirement 1", "Specific requirement 2"],
  "scopeOfWork": "Clear scope boundary — what IS included and what is NOT.",
  "deliverables": ["Concrete deliverable 1", "Concrete deliverable 2"],
  "proposedTasks": ["Short task description 1", "Short task description 2"],
  "dependencies": ["External dependency 1 (e.g. client provides branding assets)"],
  "suggestedTimelineWeeks": 8,
  "suggestedBudget": 500000,
  "suggestedMilestones": [
    {
      "title": "Milestone title",
      "description": "What this milestone covers",
      "deliverables": ["Deliverable 1", "Deliverable 2"],
      "dueDate": "YYYY-MM-DD" | null,
      "suggestedAmount": 250000
    }
  ],
  "draftAgreement": {
    "scopeOfWork": "Formal scope statement",
    "deliverables": ["Formal deliverable 1", "Formal deliverable 2"],
    "deadlines": "Timeline commitments",
    "paymentSchedule": "Payment milestones tied to deliverables",
    "milestoneConditions": "Conditions for milestone approval",
    "revisionRules": "How revisions are handled",
    "cancellationTerms": "Cancellation policy",
    "disputeProcedures": "How disputes are resolved"
  },
  "fundingArrangement": "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES",
  "currency": "NGN" | "USD" | "GHS" | "KES" | "GBP" | "EUR",
  "potentialRisks": ["Risk 1", "Risk 2"],
  "summary": "One-paragraph summary of the proposed project.",
  "assumptions": ["Every assumption you made — e.g. 'Assumed a standard e-commerce checkout flow with card payments'"],
  "missingInformation": ["Only things the client MUST confirm before proceeding — keep this short or empty"]
}

Rules:
- GENERATE FIRST. Do not ask questions unless the request is truly unworkable. Make reasonable assumptions instead.
- suggestedBudget is in MAJOR units of the chosen currency (e.g. for NGN, 500000 means ₦500,000). Make a reasonable estimate based on the project scope. If the client mentioned a budget, use it. Otherwise estimate based on typical market rates for the work described. The client will review and edit.
- suggestedAmount per milestone is also in MAJOR units. The sum of milestone amounts should roughly equal suggestedBudget.
- suggestedTimelineWeeks: make a reasonable estimate based on the scope. Never null — always suggest something the client can adjust.
- dueDate for milestones: if the client mentioned a timeframe, derive dates from it. Otherwise leave null — the client will set dates during review.
- For MILESTONE funding, suggestedMilestones should have 2-5 milestones with reasonable amounts. For FULL funding, return an empty milestones array.
- fundingArrangement: choose MILESTONE for most projects (default). Use FULL only for very small/simple projects. Use UPFRONT_PLUS_MILESTONES for larger projects where the service provider needs an upfront payment.
- currency: default to NGN unless the client's description clearly indicates another currency. For USD amounts (e.g. "international client"), use USD.
- draftAgreement is a STARTING POINT — not legal advice. Make it reasonable but generic. The client reviews with their counterparty.
- assumptions: list EVERY assumption you made. This is critical — the client needs to know what you decided for them. Examples: "Assumed card + bank transfer payments", "Assumed 6-page website", "Assumed mobile-responsive design", "Assumed admin dashboard included".
- missingInformation: keep this SHORT (0-2 items) — only things that genuinely block proceeding. Most things should be assumptions, not missing info.
- Keep the title short and descriptive. Avoid generic titles like "New Project".
- proposedTasks should be high-level (1-line descriptions) — 5-15 tasks for a typical project.
- All text must be in the same language the client is writing in (default: English).
- Do not include any keys other than those listed above.
- When the client sends follow-up messages asking for changes (e.g. "make the budget smaller", "add a mobile app", "remove the admin dashboard"), regenerate the FULL proposal with the requested changes applied. Always return a complete proposal, never a partial update.`;

// ---------------------------------------------------------------------------
// Provider call (mirrors /api/ai/assistant — 4 retries, exp backoff)
// ---------------------------------------------------------------------------

async function callAI(messages: ChatMessage[]): Promise<{ content: string; tokensUsed: number }> {
  const client = getOpenAiClient();
  const model = getAiModel();
  const maxRetries = 4;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 2000, // proposals are longer than assistant responses
      });
      const content = completion.choices?.[0]?.message?.content ?? "";
      const tokensUsed = completion.usage?.total_tokens ?? 0;
      return { content, tokensUsed };
    } catch (err) {
      lastErr = err as Error;
      const status = (err as { status?: number })?.status ?? 0;
      const isRateLimit = status === 429;
      const isRetryable = status === 500 || status === 502 || status === 503;
      if (attempt < maxRetries - 1 && isRetryable) {
        const backoff = 2000 * Math.pow(2, attempt);
        const jitter = (Math.random() - 0.5) * 1000;
        await new Promise((r) => setTimeout(r, backoff + jitter));
        continue;
      }
      if (isRateLimit) break;
      if (attempt === maxRetries - 1) break;
    }
  }
  throw lastErr ?? new Error("AI provider call failed");
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export const POST = apiRoute(async (req) => {
  const startedAt = Date.now();
  const userId = await requireUserId();

  // 1. AI consent gate (same as /api/ai/assistant)
  const userPrefs = await db.userPreferences.findUnique({
    where: { userId },
    select: { aiFeatureDisclosure: true },
  });
  if (!userPrefs?.aiFeatureDisclosure) {
    return fail(
      "AI features require explicit consent. Please enable 'AI feature disclosure' in your privacy settings to use AI project creation.",
      403,
    );
  }

  // 2. Rate limit (same as /api/ai/assistant)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userLimit = await checkRateLimit(`ai:user:${userId}`, RATE_LIMITS.AI_ASSISTANT_PER_USER);
  const ipLimit = await checkRateLimit(`ai:ip:${ip}`, RATE_LIMITS.AI_ASSISTANT_PER_IP);
  if (!userLimit.ok || !ipLimit.ok) {
    return fail("Rate limit exceeded. Please wait a moment and try again.", 429, {
      retryAfter: Math.max(userLimit.resetAt, ipLimit.resetAt) - Date.now(),
    });
  }

  // 3. Parse + validate request
  const body = await parseJsonBody<unknown>(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid request", 422);
  }

  const { messages } = parsed.data;

  // 4. Build the message thread for the LLM
  //    No project context (this is pre-project-creation). The conversation
  //    itself is the only context.
  const sanitizedThread: ChatMessage[] = messages.map((m) => ({
    role: m.role,
    content: sanitizeForAI(m.content),
  }));

  const llmMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizedThread,
  ];

  // 5. Call the AI provider
  let aiContent = "";
  let tokensUsed = 0;
  let fallbackUsed = false;
  try {
    const result = await callAI(llmMessages);
    aiContent = result.content;
    tokensUsed = result.tokensUsed;
  } catch (err) {
    logSecurityEvent("error", "ai.project_builder_provider_error", {
      userId,
      message: (err as Error)?.message?.slice(0, 200),
    });
    fallbackUsed = true;
  }

  // 6. Parse + validate the AI output. Treat as untrusted.
  let response: ProjectBuilderResponse;
  if (!aiContent || fallbackUsed) {
    response = {
      kind: "error",
      message: "I couldn't draft a project right now. Please try again, or use the manual form.",
    };
    fallbackUsed = true;
  } else {
    // Strip code fences if present despite instructions
    const cleaned = aiContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try {
      const parsedAi = JSON.parse(cleaned);
      const validated = AIResponseSchema.safeParse(parsedAi);
      if (!validated.success) {
        logSecurityEvent("warn", "ai.project_builder_invalid_output", {
          userId,
          issues: validated.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
        response = {
          kind: "error",
          message: "I had trouble structuring that. Could you rephrase what you'd like to build?",
        };
        fallbackUsed = true;
      } else if (validated.data.kind === "clarify") {
        response = { kind: "clarify", question: validated.data.question };
      } else {
        response = { kind: "proposal", proposal: validated.data };
      }
    } catch {
      logSecurityEvent("warn", "ai.project_builder_unparseable", {
        userId,
        preview: cleaned.slice(0, 120),
      });
      response = {
        kind: "error",
        message: "I had trouble understanding the response. Could you rephrase?",
      };
      fallbackUsed = true;
    }
  }

  // 7. Persist AiActivity (same pattern as /api/ai/assistant)
  const lastUserMessage = messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";
  const activityResponse = JSON.stringify(response).slice(0, 8000);
  const activity = await db.aiActivity.create({
    data: {
      userId,
      // projectId is null — this is pre-project-creation
      projectId: null,
      assistantType: "PROJECT_BUILDER",
      prompt: sanitizeForAI(lastUserMessage),
      response: activityResponse,
      tokensUsed,
      fallbackUsed,
    },
  });

  // 8. Audit event (same pattern as /api/ai/assistant)
  await recordAuditEvent({
    actorId: userId,
    // projectId is null — this is a pre-project-creation action
    projectId: null,
    action: "ai.project_builder",
    targetType: "AiActivity",
    targetId: activity.id,
    metadata: {
      tokensUsed,
      fallbackUsed,
      latencyMs: Date.now() - startedAt,
      messageCount: messages.length,
      responseKind: response.kind,
    },
  });

  return response;
});
