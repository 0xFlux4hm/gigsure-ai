/**
 * Conversational AI task builder.
 *
 * Lets a project member describe a task in natural language and get back
 * a structured, editable task proposal. The AI may ask clarifying questions
 * before producing a proposal. The proposal is NEVER created directly —
 * the client must POST it to the existing /api/projects/[id]/tasks endpoint,
 * which enforces the same authorization, validation, audit logging, and
 * state transitions as manual task creation.
 *
 * Security:
 *   - requireUserId() + project membership + task:create permission
 *   - aiFeatureDisclosure consent gate (same as /api/ai/assistant)
 *   - per-user + per-IP rate limit
 *   - all user input + assembled context is sanitized before reaching the LLM
 *   - AI output is treated as untrusted — re-validated by Zod on the server
 *   - provider error detail is logged server-side only; client gets a
 *     generic message
 *   - AiActivity is persisted + audit event recorded (same pattern as
 *     /api/ai/assistant)
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
import { AuthzError, assertPermission } from "@/lib/auth/authorization";
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
  projectId: z.string().cuid(),
  // Conversation thread. The most recent message is the latest user turn.
  messages: z.array(MessageSchema).min(1).max(20),
});

// The structured task proposal the AI may return. All fields are optional
// except title — the AI may not have enough info to fill everything in,
// and the user will edit the preview before submission.
const TaskProposalSchema = z.object({
  kind: z.literal("proposal"),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().default(""),
  deliverables: z.array(z.string().max(300)).max(20).optional().default([]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().default("MEDIUM"),
  dueDate: z.string().nullable().optional(),
  // Suggested assignee — the AI returns the displayName so the user can
  // confirm; the client resolves it to a userId via the members list
  // before posting to /tasks. The server endpoint re-validates membership.
  suggestedAssigneeName: z.string().nullable().optional(),
  acceptanceCriteria: z.array(z.string().max(300)).max(20).optional().default([]),
  dependencies: z.array(z.string().max(200)).max(10).optional().default([]),
  // Plain-language summary the client shows above the structured preview
  summary: z.string().max(800).optional().default(""),
});

// If the AI needs more information, it returns a clarifying question instead.
const ClarifyingQuestionSchema = z.object({
  kind: z.literal("clarify"),
  question: z.string().min(1).max(800),
});

const AIResponseSchema = z.discriminatedUnion("kind", [
  TaskProposalSchema,
  ClarifyingQuestionSchema,
]);

type TaskBuilderResponse =
  | { kind: "proposal"; proposal: z.infer<typeof TaskProposalSchema> }
  | { kind: "clarify"; question: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Sanitization (matches /api/ai/assistant/route.ts pattern — kept local to
// avoid cross-module coupling; the canonical helpers there aren't exported)
// ---------------------------------------------------------------------------

function sanitizeForAI(input: string): string {
  // Strip control chars + null bytes (prompt-injection primitives)
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, 4000);
}

function deepSanitize<T>(obj: T): T {
  if (typeof obj === "string") return sanitizeForAI(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map((v) => deepSanitize(v)) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = deepSanitize(v);
    }
    return out as unknown as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Context assembly (compact — only what the task builder needs)
// ---------------------------------------------------------------------------

async function assembleTaskBuilderContext(projectId: string, userId: string): Promise<string> {
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      status: true,
      currency: true,
      fundingArrangement: true,
      dueDate: true,
      memberships: {
        where: { revokedAt: null },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              displayName: true,
              profile: { select: { professionalRole: true } },
            },
          },
        },
      },
      tasks: {
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      milestones: {
        select: { id: true, title: true, status: true, dueDate: true, orderIndex: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  if (!project) return "";

  const rawCtx = {
    project: {
      title: project.title,
      status: project.status,
      fundingArrangement: project.fundingArrangement,
      dueDate: project.dueDate,
    },
    // Members the AI may suggest as assignees. We expose id + displayName +
    // role + professionalRole so the AI can pick a sensible default.
    members: project.memberships.map((m) => ({
      id: m.user.id,
      displayName: m.user.displayName,
      role: m.role,
      professionalRole: m.user.profile?.professionalRole ?? null,
    })),
    existingTasks: project.tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
    milestones: project.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      dueDate: m.dueDate,
    })),
  };
  return JSON.stringify(deepSanitize(rawCtx), null, 2);
}

// ---------------------------------------------------------------------------
// System prompt — instructs the AI to return strict JSON
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are GigSure's AI Task Builder. You help project members turn natural-language requests into clear, actionable tasks.

Your job:
1. Understand what the user wants done.
2. If important information is missing (e.g. scope, acceptance criteria, deadline constraints), ask ONE focused clarifying question. Do not ask unnecessary questions. Do not invent details.
3. When you have enough information, produce a structured task proposal.

You MUST respond with a single JSON object and nothing else. No Markdown, no code fences, no commentary outside the JSON. The JSON must match exactly one of these shapes:

To ask a clarifying question:
{
  "kind": "clarify",
  "question": "One short, focused question (max 1-2 sentences)."
}

To produce a task proposal:
{
  "kind": "proposal",
  "title": "Concise task title (2-12 words, imperative mood)",
  "description": "1-3 paragraph description of what needs to be done. Plain text, no Markdown.",
  "deliverables": ["Concrete deliverable 1", "Concrete deliverable 2"],
  "priority": "LOW" | "MEDIUM" | "HIGH",
  "dueDate": "ISO 8601 date (YYYY-MM-DD)" | null,
  "suggestedAssigneeName": "Exact displayName of a project member" | null,
  "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
  "dependencies": ["Short description of a prerequisite task"],
  "summary": "One sentence summary of the proposed task."
}

Rules:
- NEVER invent deadlines. Only suggest a dueDate if the user explicitly mentioned a timeframe or if a project milestone has a dueDate that clearly bounds this task.
- NEVER invent assignees. Only suggest a suggestedAssigneeName if it exactly matches the displayName of a member in the provided project context AND that member's role makes sense for the task (COLLABORATOR, TEAM_LEAD, or OWNER — not CLIENT or REVIEWER for execution work).
- Keep the title short and actionable. Avoid generic titles like "New task" or "Task".
- Description should explain WHAT needs to be done, not WHY (the user already knows why).
- Deliverables and acceptance criteria must be specific and verifiable.
- If the user's request is ambiguous, ask a clarifying question rather than guessing.
- Do not include any keys other than those listed above.
- All text must be in the same language the user is writing in (default: English).

You will receive the project context as a JSON object inside <!--GIGSURE_CONTEXT_BEGIN--> and <!--GIGSURE_CONTEXT_END--> markers. Use it to ground your suggestions but do not repeat it back.`;

// ---------------------------------------------------------------------------
// Provider call (mirrors /api/ai/assistant/route.ts — 4 retries, exp backoff)
// ---------------------------------------------------------------------------

async function callAI(messages: ChatMessage[]): Promise<{ content: string; tokensUsed: number }> {
  const maxRetries = 4;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // getOpenAiClient() is called INSIDE the try so that a missing
      // env var (AuthnError 503) is caught and surfaces as a generic
      // fallback — never the raw env-var-name/dashboard-URL error.
      const client = getOpenAiClient();
      const model = getAiModel();
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1200,
      });
      const content = completion.choices?.[0]?.message?.content ?? "";
      const tokensUsed = completion.usage?.total_tokens ?? 0;
      return { content, tokensUsed };
    } catch (err) {
      lastErr = err as Error;
      const status = (err as { status?: number })?.status ?? 0;
      // Gemini 429s fail fast (per-minute quota — retrying makes it worse)
      const isRateLimit = status === 429;
      const isRetryable = status === 500 || status === 502 || status === 503;
      if (attempt < maxRetries - 1 && isRetryable) {
        const backoff = 2000 * Math.pow(2, attempt);
        const jitter = (Math.random() - 0.5) * 1000;
        await new Promise((r) => setTimeout(r, backoff + jitter));
        continue;
      }
      // For 429s (any provider) fail fast — no retry
      if (isRateLimit) break;
      // For other errors on the last attempt, break and let caller handle
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
      "AI features require explicit consent. Please enable 'AI feature disclosure' in your privacy settings to use AI task creation.",
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

  const { projectId, messages } = parsed.data;

  // 4. Authorization — membership + task:create permission
  // The AI is helping the user DRAFT a task; only people who can create
  // tasks should be able to invoke the task builder. The actual task
  // creation happens later via POST /api/projects/[id]/tasks, which
  // re-checks permission — so even if the AI proposal is tampered with,
  // the backend enforces authorization at creation time.
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "task:create");

  // 5. Assemble + sanitize context
  const context = await assembleTaskBuilderContext(projectId, userId);

  // 6. Build the message thread for the LLM
  //    - System prompt instructs strict JSON output
  //    - User turn 0: project context + the user's conversation
  const sanitizedThread: ChatMessage[] = messages.map((m) => ({
    role: m.role,
    content: sanitizeForAI(m.content),
  }));

  const userTurn = context
    ? `<!--GIGSURE_CONTEXT_BEGIN-->\n${context}\n<!--GIGSURE_CONTEXT_END-->\n\nHere is the conversation so far. Respond with a single JSON object as instructed.`
    : `Respond with a single JSON object as instructed.`;

  const llmMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    // Inject context as the first user turn so the LLM has grounding.
    { role: "user", content: userTurn },
    // Then the actual conversation (assistant turns included for continuity)
    ...sanitizedThread,
  ];

  // 7. Call the AI provider
  let aiContent = "";
  let tokensUsed = 0;
  let fallbackUsed = false;
  let isDailyLimit = false;
  try {
    const result = await callAI(llmMessages);
    aiContent = result.content;
    tokensUsed = result.tokensUsed;
  } catch (err) {
    const errMsg = (err as Error)?.message ?? "";
    isDailyLimit = /daily|per.?day|24.?hour/i.test(errMsg) || (err as { status?: number })?.status === 429;
    // SECURITY: log diagnostic detail server-side only (never expose
    // provider/model/env-var names to the client — see security audit).
    logSecurityEvent("error", "ai.task_builder_provider_error", {
      userId,
      projectId,
      message: errMsg.slice(0, 200),
    });
    fallbackUsed = true;
  }

  // 8. Parse + validate the AI output. Treat as untrusted.
  let response: TaskBuilderResponse;
  if (!aiContent || fallbackUsed) {
    response = {
      kind: "error",
      message: isDailyLimit
        ? "The daily AI request limit has been reached. Please try again tomorrow, or use the manual form."
        : "I couldn't draft a task right now. Please try again, or use the manual form.",
    };
    fallbackUsed = true;
  } else {
    // The LLM may wrap JSON in code fences despite instructions. Strip them.
    const cleaned = aiContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try {
      const parsedAi = JSON.parse(cleaned);
      const validated = AIResponseSchema.safeParse(parsedAi);
      if (!validated.success) {
        logSecurityEvent("warn", "ai.task_builder_invalid_output", {
          userId,
          projectId,
          issues: validated.error.issues.map((i) => ({ path: i.path, message: i.message })),
        });
        response = {
          kind: "error",
          message: "I had trouble structuring that. Could you rephrase what you'd like done?",
        };
        fallbackUsed = true;
      } else if (validated.data.kind === "clarify") {
        response = { kind: "clarify", question: validated.data.question };
      } else {
        response = { kind: "proposal", proposal: validated.data };
      }
    } catch {
      logSecurityEvent("warn", "ai.task_builder_unparseable", {
        userId,
        projectId,
        preview: cleaned.slice(0, 120),
      });
      response = {
        kind: "error",
        message: "I had trouble understanding the response. Could you rephrase?",
      };
      fallbackUsed = true;
    }
  }

  // 9. Persist AiActivity (same pattern as /api/ai/assistant)
  //    Store the latest user message as the prompt and a compact JSON of
  //    the response as the response text.
  const lastUserMessage = messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";
  const activityResponse = JSON.stringify(response).slice(0, 8000);
  const activity = await db.aiActivity.create({
    data: {
      userId,
      projectId,
      assistantType: "TASK_BUILDER",
      prompt: sanitizeForAI(lastUserMessage),
      response: activityResponse,
      tokensUsed,
      fallbackUsed,
    },
  });

  // 10. Audit event (same pattern as /api/ai/assistant)
  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "ai.task_builder",
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
