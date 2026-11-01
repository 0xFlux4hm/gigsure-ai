/**
 * Unified AI provider abstraction.
 *
 * Supports two backends, switchable via env vars with no code changes:
 *
 *   1. AgentRouter (default if AI_PROVIDER=agentrouter)
 *      - OpenAI-compatible gateway at https://co.agentrouter.org/v1
 *      - Serves glm-5.2, claude-opus-4-8, gpt-5.5, kimi-k2.6, etc.
 *      - Bearer auth via AGENTROUTER_API_KEY
 *      - Has its own rate limits (typically more generous than Z.AI free tier)
 *
 *   2. Z.AI (default if AI_PROVIDER unset or =zai)
 *      - Native Z.AI endpoint at https://api.z.ai/api/paas/v4/
 *      - Serves glm-4.7-flash (free) and glm-4.5-air (paid)
 *      - Bearer auth via ZAI_API_KEY
 *
 * The Z.AI SDK wrapper is kept for backwards compatibility — but the new
 * OpenAI-compatible path is preferred because it works with any OpenAI-
 * compatible gateway (AgentRouter, OpenRouter, OpenAI direct, etc.).
 */
import OpenAI from "openai";
import { AuthnError } from "@/lib/auth/authorization";

export type AiProvider = "agentrouter" | "zai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  tokensUsed: number;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Disable thinking/reasoning tokens. Default: true (most agents don't need them). */
  disableThinking?: boolean;
}

/** Default model per provider. Override via AI_MODEL env var. */
const DEFAULT_MODEL_PER_PROVIDER: Record<AiProvider, string> = {
  // glm-4.5-air is on AgentRouter's Tier 1 — FREE (consumes $0 from credit
  // balance). Per https://agentrouter.org/docs/index.html the model catalog
  // also offers: glm-4.6 (free), deepseek-r1 (~$0.55/1M), gpt-4o (~$2.50/1M),
  // claude-sonnet-4-5-20250929 (~$3/1M), and more. New sign-ups get $200 in
  // free credits via referral.
  //
  // If you want maximum quality + have credits to spare, try:
  //   AI_MODEL=claude-sonnet-4-5-20250929  (best for complex reasoning)
  //   AI_MODEL=gpt-4o                      (best for structured outputs)
  //   AI_MODEL=deepseek-r1                 (best free-tier reasoning)
  agentrouter: "glm-4.5-air",
  // glm-4.7-flash is the only genuinely free Z.AI model. If you have Z.AI
  // balance, switch to glm-4.5-air via the AI_MODEL env var.
  zai: "glm-4.7-flash",
};

let _cachedOpenAi: OpenAI | null = null;

/**
 * Resolve the active AI provider from env vars.
 *
 *   AI_PROVIDER=agentrouter  → use AgentRouter with OpenAI SDK
 *   AI_PROVIDER=zai          → use Z.AI with the z-ai-web-dev-sdk wrapper
 *   (unset)                  → defaults to "zai" for backwards compat
 */
export function getAiProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "zai").toLowerCase();
  return v === "agentrouter" ? "agentrouter" : "zai";
}

/**
 * Resolve the model identifier based on provider + env override.
 */
export function getAiModel(): string {
  const provider = getAiProvider();
  return process.env.AI_MODEL ?? DEFAULT_MODEL_PER_PROVIDER[provider];
}

/**
 * Returns a cached OpenAI client configured for the active provider.
 *
 * For AgentRouter: base URL = https://co.agentrouter.org/v1, key = AGENTROUTER_API_KEY
 * For Z.AI direct via OpenAI SDK: base URL = https://api.z.ai/api/paas/v4/, key = ZAI_API_KEY
 *
 * Throws AuthnError (whitelisted by apiRoute) if env vars are missing.
 */
export function getOpenAiClient(): OpenAI {
  if (_cachedOpenAi) return _cachedOpenAi;

  const provider = getAiProvider();
  let apiKey: string | undefined;
  let baseURL: string;

  if (provider === "agentrouter") {
    apiKey = process.env.AGENTROUTER_API_KEY;
    if (!apiKey) {
      throw new AuthnError(
        "AI_PROVIDER=agentrouter is set, but AGENTROUTER_API_KEY is missing. " +
          "Create a key at https://agentrouter.org/console/token and add it to " +
          "Vercel Project Settings → Environment Variables, then redeploy.",
        503,
      );
    }
    // Base URL priority:
    //   1. AGENTROUTER_BASE_URL env var (if user wants to override)
    //   2. co.agentrouter.org/v1 — the Singapore-region API endpoint.
    //      We use the `co.` subdomain because the bare `agentrouter.org/v1`
    //      endpoint is behind an Aliyun WAF that blocks non-browser requests
    //      from cloud IPs (Vercel, AWS, etc.). The `co.` subdomain accepts
    //      raw API traffic directly without WAF protection.
    //   Per the AgentRouter docs (https://agentrouter.org/docs/index.html),
    //   both endpoints accept the same auth + serve the same models.
    baseURL = process.env.AGENTROUTER_BASE_URL ?? "https://co.agentrouter.org/v1";
  } else {
    // Z.AI direct — also works with the OpenAI SDK because Z.AI's public
    // endpoint is OpenAI-compatible. This unifies the code path.
    apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new AuthnError(
        "AI is not configured on this deployment. Create an API key at " +
          "https://z.ai/manage-apikey/apikey-list and add ZAI_API_KEY to " +
          "Vercel Project Settings → Environment Variables, then redeploy.",
        503,
      );
    }
    baseURL = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4/";
  }

  _cachedOpenAi = new OpenAI({ apiKey, baseURL });
  return _cachedOpenAi;
}

/**
 * Returns true if the AI provider is configured (env vars are set).
 * Useful for health checks + UI states that want to show "AI unavailable"
 * gracefully.
 */
export function isAiConfigured(): boolean {
  if (getAiProvider() === "agentrouter") {
    return !!process.env.AGENTROUTER_API_KEY;
  }
  return !!process.env.ZAI_API_KEY;
}

/**
 * Reset the cached client. Useful for tests.
 */
export function resetAiClientCache(): void {
  _cachedOpenAi = null;
}

// ─── In-memory response cache (5-min TTL) ──────────────────────────────
//
// Same dedup logic as before — repeated calls with identical
// (model + messages) within 5 minutes return the cached response,
// skipping the provider call entirely. Critical for the free-tier
// 1302 throttle on Z.AI; also useful as a general cost-saver.

interface CacheEntry {
  response: string;
  tokensUsed: number;
  expiresAt: number;
}
const _responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function aiCacheKey(
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256");
  hash.update(model);
  for (const m of messages) {
    hash.update(`\n${m.role}:\n${m.content}`);
  }
  return hash.digest("hex").slice(0, 32);
}

export interface CachedResult {
  content: string;
  tokensUsed: number;
}

export function aiCacheGet(key: string): CachedResult | null {
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _responseCache.delete(key);
    return null;
  }
  return { content: entry.response, tokensUsed: entry.tokensUsed };
}

export function aiCacheSet(key: string, content: string, tokensUsed: number): void {
  _responseCache.set(key, {
    response: content,
    tokensUsed,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Z.AI-specific model constant (kept for backwards compatibility with
 * existing route code that imports ZAI_MODEL directly).
 * @deprecated use getAiModel() instead.
 */
export const ZAI_MODEL = process.env.AI_MODEL ?? DEFAULT_MODEL_PER_PROVIDER.zai;
