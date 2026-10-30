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
