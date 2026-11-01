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

export type AiProvider = "agentrouter" | "zai" | "gemini" | "deepseek";

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
  // ─── DeepSeek (BEST FOR HACKATHON DEMO — free $8 credit + no rate limits) ─
  // deepseek-flash is the cheapest production-tier model we've found.
  // Per https://api-docs.deepseek.com/quick_start/pricing:
  //   - Off-peak (most hours): $0.15/1M input cache-miss, $0.60/1M output
  //   - Peak (01:00-04:00 + 06:00-10:00 UTC weekdays): 2× the off-peak rate
  //   - Cache hit: $0.003/1M (basically free for repeated prompts)
  //   - Context: 1M tokens
  //   - Max output: 384K tokens
  //   - Vision supported
  //
  // FREE TIER: 5 million tokens on signup (~$8 of usage), no credit card
  // required, valid 30 days. Sign up at https://platform.deepseek.com/usage
  //
  // RATE LIMITS: NO per-minute or daily caps — only concurrency limits
  // (2,500 concurrent requests for Flash, 500 for V4-Pro). For our use
  // case this means effectively unlimited throughput — no 1302 errors
  // like Z.AI, no 15 RPM cap like Gemini.
  //
  // PAID UPGRADE for higher quality reasoning:
  //   AI_MODEL=deepseek-v4-pro   (~$0.66/$1.98 per 1M off-peak)
  //
  // NOTE: "DeepSeek Harness" (dsh) is a separate open-source coding
  // agent CLI released August 2026. We DON'T use that — we use the
  // standard DeepSeek API which is OpenAI-compatible.
  deepseek: "deepseek-flash",

  // ─── Z.AI direct (DEFAULT — works with existing ZAI_API_KEY) ──────
  // glm-4.7-flash is the only genuinely free Z.AI model. Suffers from
  // undocumented "1302 high concurrency" rate limiting under load.
  // If you have Z.AI balance, switch to glm-4.5-air via the AI_MODEL env var.
  zai: "glm-4.7-flash",

  // ─── Google Gemini ───────────────────────────────────────────────
  // gemini-3.8-flash is the latest free-tier Flash model from Google.
  // Older gemini-2.0-flash was deprecated in 2026 — Gemini now returns
  // "This model is no longer available. Please use gemini-3.8-flash."
  //
  // Free-tier rate limits (per https://ai.google.dev/gemini-api/docs/rate-limits):
  //    ~15 requests/minute (RPM) — 15× higher than Z.AI's ~1 RPM
  //    ~1,000,000 tokens/minute (TPM) — practically unlimited
  //    ~1,500 requests/day (RPD) — resets at midnight Pacific time
  //
  // IMPORTANT — Supported regions: Gemini API is geo-restricted. Hong Kong,
  // China, Macau, Iran, North Korea, Russia, Syria are NOT supported.
  // Nigeria, US, EU, most of Africa, and most of Asia ARE supported.
  gemini: "gemini-3.8-flash",

  // ─── AgentRouter ────────────────────────────────────────────────
  // glm-4.5-air is on AgentRouter's Tier 1 — FREE (consumes $0 from credit
  // balance). New sign-ups get $200 in free credits via referral.
  agentrouter: "glm-4.5-air",
};

let _cachedOpenAi: OpenAI | null = null;

/**
 * Resolve the active AI provider from env vars.
 *
 *   AI_PROVIDER=deepseek     → DeepSeek (RECOMMENDED — $8 free credit, no rate limits)
 *   AI_PROVIDER=zai          → Z.AI direct (DEFAULT — free glm-4.7-flash)
 *   AI_PROVIDER=gemini       → Google Gemini (15 RPM / 1,500 RPD free tier)
 *   AI_PROVIDER=agentrouter  → AgentRouter (multi-model gateway, $200 free credits)
 *   (unset)                  → defaults to "zai" for backwards compat
 *
 * The default is Z.AI because the user's ZAI_API_KEY is already on Vercel.
 * But DeepSeek is the best option for the hackathon demo — sign up at
 * https://platform.deepseek.com/usage to get $8 in free credits (no card),
 * then set:
 *   AI_PROVIDER=deepseek
 *   DEEPSEEK_API_KEY=<your key>
 *
 * DeepSeek advantages over the alternatives:
 *   - No 1302 'high concurrency' throttle like Z.AI's free tier
 *   - No 15 RPM cap like Gemini's free tier (DeepSeek only caps concurrency,
 *     at 2,500 concurrent for Flash — basically unlimited for our use case)
 *   - No geo-blocks like Gemini (works from HK, China, anywhere)
 *   - $8 free credit on signup = ~50,000+ AI calls before you'd pay anything
 */
export function getAiProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "zai").toLowerCase();
  if (v === "deepseek") return "deepseek";
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
 * For DeepSeek:      base URL = https://api.deepseek.com, key = DEEPSEEK_API_KEY
 * For Gemini:        base URL = https://generativelanguage.googleapis.com/v1beta/openai/, key = GEMINI_API_KEY
 * For AgentRouter:   base URL = https://co.agentrouter.org/v1, key = AGENTROUTER_API_KEY
 * For Z.AI direct:   base URL = https://api.z.ai/api/paas/v4/, key = ZAI_API_KEY
 *
 * All four providers expose an OpenAI-compatible /chat/completions
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

  if (provider === "deepseek") {
    // DeepSeek — OpenAI-compatible endpoint.
    // Sign up at https://platform.deepseek.com/usage to get $8 in free credits.
    // No credit card required. Free credits valid for 30 days.
    // Rate limits: no RPM/RPD caps — only concurrency (2500 for Flash).
    apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new AuthnError(
        "AI_PROVIDER=deepseek is set, but DEEPSEEK_API_KEY is missing. " +
          "Sign up at https://platform.deepseek.com/usage to get $8 in free " +
          "credits (no credit card required), then add DEEPSEEK_API_KEY to " +
          "Vercel Project Settings → Environment Variables, then redeploy.",
        503,
      );
    }
    // Per https://api-docs.deepseek.com the OpenAI-compatible base URL is
    // https://api.deepseek.com (the standard OpenAI SDK appends /chat/completions).
    // No WAF, no captcha, no geo-blocks — works from anywhere.
    baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  } else if (provider === "gemini") {
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
  if (provider === "deepseek") return !!process.env.DEEPSEEK_API_KEY;
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
