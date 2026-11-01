/**
 * Z.AI SDK wrapper that reads config from environment variables.
 *
 * PROBLEM #1 (solved earlier):
 *   The z-ai-web-dev-sdk's ZAI.create() reads config from a `.z-ai-config`
 *   JSON file at /etc/.z-ai-config (etc.) which doesn't exist on Vercel.
 *   Fixed by constructing ZAI directly from env vars.
 *
 * PROBLEM #2 (solved now):
 *   The default baseUrl was `https://internal-api.z.ai/v1` — that's the
 *   INTERNAL endpoint, only reachable from inside Alibaba Cloud's network.
 *   On Vercel (AWS), DNS resolves it to a private 172.25.x.x address →
 *   fetch() throws 'TypeError: fetch failed'.
 *
 *   The PUBLIC endpoint is `https://api.z.ai/api/paas/v4/` (per
 *   https://docs.z.ai/guides/develop/openai/python). It's reachable
 *   from anywhere on the public internet (Vercel included).
 *
 * ENV VARS:
 *   ZAI_API_KEY     — your real Z.AI API key (from https://z.ai/manage-apikey/apikey-list)
 *                     NOT the sandbox marker 'Z.ai' — that only works on the internal endpoint.
 *   ZAI_BASE_URL    — defaults to the public endpoint: https://api.z.ai/api/paas/v4/
 *                     Override only if you have a custom endpoint.
 *   ZAI_USER_ID     — optional, used for tracking (ignored by public endpoint)
 *   ZAI_CHAT_ID     — optional, used for chat session tracking (ignored by public endpoint)
 *   ZAI_TOKEN       — optional JWT token (ignored by public endpoint — uses API key auth)
 *
 * If ZAI_API_KEY is not set, getZai() throws an AuthnError (which IS in
 * the apiRoute whitelist) so the error message reaches the client with
 * a clear actionable explanation instead of generic "Internal server error".
 */
import ZAI from "z-ai-web-dev-sdk";
import { AuthnError } from "@/lib/auth/authorization";

export interface ZaiConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let _cachedZai: ZAI | null = null;

// Public Z.AI endpoint — reachable from any cloud (Vercel, AWS, GCP, etc.)
// Per https://docs.z.ai/guides/develop/openai/python
const DEFAULT_PUBLIC_BASE_URL = "https://api.z.ai/api/paas/v4/";

/**
 * Returns a cached ZAI instance configured from env vars.
 * The instance is created once + reused — ZAI is stateless after construction.
 *
 * Throws AuthnError (whitelisted by apiRoute) if env vars are missing,
 * so the error message reaches the client with actionable guidance.
 */
export function getZai(): ZAI {
  if (_cachedZai) return _cachedZai;

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    // AuthnError is in the apiRoute whitelist, so this message reaches the
    // client verbatim instead of being replaced with "Internal server error".
    throw new AuthnError(
      "AI is not configured on this deployment. Create an API key at " +
        "https://z.ai/manage-apikey/apikey-list and add ZAI_API_KEY to " +
        "Vercel Project Settings → Environment Variables, then redeploy.",
      503,
    );
  }

  const baseUrl = process.env.ZAI_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL;

  const config: ZaiConfig = {
    baseUrl,
    apiKey,
    // Optional fields — only used by the internal sandbox endpoint.
    // Public endpoint ignores these. We pass them through in case someone
    // is running against the internal endpoint from the dev sandbox.
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
  };

  _cachedZai = new (ZAI as unknown as { new (config: ZaiConfig): ZAI })(config);
  return _cachedZai;
}

/**
 * The model identifier to use for chat completions.
 *
 * Default: `glm-4.7-flash` — the only genuinely FREE model on Z.AI's API
 * (no daily cap, no credit card required, $0 for input + output tokens).
 *
 * IMPORTANT: Free-tier Flash models are rate-limited by Z.AI's undocumented
 * per-account throttle. When concurrency exceeds the limit (which can be
 * as low as 1 RPM under load), Z.AI returns:
 *   429 + { "error": { "code": "1302", "message": "Rate limit reached" } }
 * or
 *   429 + { "error": { "code": "1302", "message": "High concurrency usage" } }
 *
 * Mitigations applied in the AI routes:
 *   1. Aggressive exponential backoff (2s → 4s → 8s) with jitter — the
 *      1302 error is transient; waiting actually works.
 *   2. In-memory response cache (5 min TTL) — duplicate AI calls within
 *      a single deployment reuse the previous result instead of hitting
 *      Z.AI again.
 *   3. The deterministic fallback is shown if all retries fail.
 *
 * If you have a paid Z.AI account, set `ZAI_MODEL=glm-4.5-air` in env vars
 * to switch to the paid tier (~$0.13/1M input, ~$0.85/1M output) which
 * has stable throughput up to ~100 RPM and no 1302 errors.
 *
 * Other model options (all require a paid Z.AI balance):
 *   - `glm-4.7-flashx`  ($0.07/$0.40 — cheapest paid)
 *   - `glm-5.3-flash`   ($0.05/$0.18 — newest Aug 2026, 1M context, multimodal)
 *   - `glm-5.3`         (flagship, ~$0.50+/1M — highest quality)
 *
 * See https://docs.z.ai for the full model catalog.
 */
export const ZAI_MODEL = process.env.ZAI_MODEL ?? "glm-4.7-flash";

/**
 * In-memory response cache for AI calls. Keyed by a hash of
 * (model + messages). 5-minute TTL.
 *
 * Why this matters for the free tier:
 *   Z.AI's free glm-4.7-flash model has aggressive per-account throttling
 *   (1302 "high concurrency" errors). The same contract analysis or
 *   assistant prompt called twice within 5 minutes would normally hit
 *   Z.AI twice, doubling the risk of triggering the throttle. With this
 *   cache, the second call returns instantly from memory — zero Z.AI
 *   requests, zero throttling risk.
 *
 * Cache entries are short-lived because:
 *   - Contract text rarely changes within a 5-min window during a demo
 *   - Assistant context (project state) changes are minor within 5 min
 *   - Forcing a refresh after 5 min ensures the user sees updates
 *
 * The cache is per-server-instance (Vercel serverless function instance).
 * It is NOT shared across instances — that's fine because the goal is
 * to deduplicate calls within a single instance's lifecycle, which is
 * where the burst-pattern throttle risk is highest.
 */
interface CacheEntry {
  response: string;
  expiresAt: number;
}
const _responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a stable cache key from model + messages.
 * Uses the same hashToken() we use for security event correlation.
 */
export async function aiCacheKey(
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256");
  hash.update(model);
  for (const m of messages) {
    hash.update(`\n${m.role}:\n${m.content}`);
  }
  return hash.digest("hex").slice(0, 32);
}

/**
 * Read a cached AI response. Returns null if not cached or expired.
 */
export function aiCacheGet(key: string): string | null {
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _responseCache.delete(key);
    return null;
  }
  return entry.response;
}

/**
 * Store an AI response in the cache with a 5-min TTL.
 */
export function aiCacheSet(key: string, response: string): void {
  _responseCache.set(key, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Returns true if the Z.AI SDK is configured (env vars are set).
 * Useful for health checks + UI states that want to show "AI unavailable"
 * gracefully.
 */
export function isZaiConfigured(): boolean {
  return !!process.env.ZAI_API_KEY;
}

/**
 * Reset the cached ZAI instance. Useful for tests that want to
 * re-create the instance with different env vars.
 */
export function resetZaiCache(): void {
  _cachedZai = null;
}
