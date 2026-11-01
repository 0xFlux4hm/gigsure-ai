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

export type AiProvider = "agentrouter" | "zai" | "gemini";

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
  // ─── Google Gemini (RECOMMENDED for free-tier use) ────────────────
  // gemini-3.8-flash is the latest free-tier Flash model from Google.
  // Older gemini-2.0-flash was deprecated in 2026 — Gemini now returns
  // "This model is no longer available. Please use gemini-3.8-flash."
  //
  // Free-tier rate limits (per https://ai.google.dev/gemini-api/docs/rate-limits):
  //    ~15 requests/minute (RPM) — 15× higher than Z.AI's ~1 RPM
  //    ~1,000,000 tokens/minute (TPM) — practically unlimited
  //    ~1,500 requests/day (RPD) — resets at midnight Pacific time
  //
  // The Gemini API exposes an OpenAI-compatible endpoint at
  // https://generativelanguage.googleapis.com/v1beta/openai/ — so the
  // standard `openai` SDK works out of the box, no code rewrite needed.
  //
  // Available free models (per https://ai.google.dev/gemini-api/docs/pricing):
  //   - gemini-3.8-flash        (default — latest, 1M ctx, multimodal)
  //   - gemini-3.5-flash-lite   (smaller, faster, also free)
  //   - gemini-2.5-flash        (still free for now, ~$0.30/$2.50 if paid)
  //
  // IMPORTANT — Supported regions: Gemini API is geo-restricted. Hong Kong,
  // China, Macau, Iran, North Korea, Russia, Syria are NOT supported.
  // Nigeria, US, EU, most of Africa, and most of Asia ARE supported.
  // Vercel serverless functions run from supported regions (US/EU), so
  // production deployments work fine.
  //
  // For higher quality (paid), use:
  //   AI_MODEL=gemini-2.5-pro    (best Gemini reasoning, ~$1.25/1M in/out)
  //   AI_MODEL=gemini-4-argon    (premium flagship, requires paid tier)
  gemini: "gemini-3.8-flash",

  // ─── AgentRouter ────────────────────────────────────────────────
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

  // ─── Z.AI direct (legacy default) ────────────────────────────────
  // glm-4.7-flash is the only genuinely free Z.AI model. Suffers from
  // undocumented "1302 high concurrency" rate limiting under load.
  // If you have Z.AI balance, switch to glm-4.5-air via the AI_MODEL env var.
  zai: "glm-4.7-flash",
};

let _cachedOpenAi: OpenAI | null = null;

/**
 * Resolve the active AI provider from env vars.
 *
 *   AI_PROVIDER=zai          → Z.AI direct (DEFAULT — free glm-4.7-flash)
 *   AI_PROVIDER=gemini       → Google Gemini (15 RPM / 1,500 RPD free tier)
 *   AI_PROVIDER=agentrouter  → AgentRouter (multi-model gateway, $200 free credits)
 *   (unset)                  → defaults to "zai" for backwards compat
 *
 * The default is Z.AI because:
 *   - The user's ZAI_API_KEY is already configured on Vercel (no env var changes needed)
 *   - glm-4.7-flash is genuinely free ($0 in + $0 out, no daily cap)
 *   - The retry logic + 5-min response cache handles the 1302 throttle gracefully
 *
 * To switch to Gemini for higher rate limits (15 RPM vs Z.AI's ~1 RPM), set:
 *   AI_PROVIDER=gemini
 *   GEMINI_API_KEY=<free key from https://aistudio.google.com/apikey>
 */
export function getAiProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "zai").toLowerCase();
  if (v === "agentrouter") return "agentrouter";
  if (v === "gemini" || v === "google") return "gemini";
  if (v === "zai") return "zai";
  // Default: Z.AI (works with the existing ZAI_API_KEY env var on Vercel)
  return "zai";
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
 * For Gemini:       base URL = https://generativelanguage.googleapis.com/v1beta/openai/, key = GEMINI_API_KEY
 * For AgentRouter:  base URL = https://co.agentrouter.org/v1, key = AGENTROUTER_API_KEY
 * For Z.AI direct:  base URL = https://api.z.ai/api/paas/v4/, key = ZAI_API_KEY
 *
 * All three providers expose an OpenAI-compatible /chat/completions
 * endpoint, so the standard `openai` SDK works for all of them — only
 * the baseURL + apiKey differ.
 *
 * Throws AuthnError (whitelisted by apiRoute) if env vars are missing.
 */
export function getOpenAiClient(): OpenAI {
  if (_cachedOpenAi) return _cachedOpenAi;

  const provider = getAiProvider();
  let apiKey: string | undefined;
  let baseURL: string;

  if (provider === "gemini") {
    // Google Gemini — OpenAI-compatible endpoint.
    // Get a free API key at https://aistudio.google.com/apikey
    // The free tier gives you 15 RPM / 1M TPM / 1,500 RPD on gemini-2.0-flash.
    apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AuthnError(
        "AI_PROVIDER=gemini is set, but GEMINI_API_KEY is missing. " +
          "Create a free API key at https://aistudio.google.com/apikey and add it to " +
          "Vercel Project Settings → Environment Variables, then redeploy.",
        503,
      );
    }
    // Per https://ai.google.dev/gemini-api/docs/openai the OpenAI-compatible
    // endpoint lives at /v1beta/openai/. The standard OpenAI SDK appends
    // /chat/completions to the baseURL automatically.
    // No WAF, no captcha — works directly from Vercel serverless.
    baseURL = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/";
  } else if (provider === "agentrouter") {
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
  const provider = getAiProvider();
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "agentrouter") return !!process.env.AGENTROUTER_API_KEY;
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
