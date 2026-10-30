/**
 * Z.AI SDK wrapper that reads config from environment variables.
 *
 * PROBLEM:
 *   The z-ai-web-dev-sdk's ZAI.create() static method reads config from a
 *   `.z-ai-config` JSON file in:
 *     - process.cwd()/.z-ai-config
 *     - ~/.z-ai-config
 *     - /etc/.z-ai-config
 *
 *   On Vercel serverless, none of these paths are writable, so ZAI.create()
 *   throws "Configuration file not found or invalid" — the AI assistant
 *   endpoint silently fell back to the deterministic fallback message
 *   ("AI provider unavailable. Deterministic fallback: ...") instead of
 *   actually calling the model.
 *
 * SOLUTION:
 *   Construct ZAI directly using the constructor (which accepts a config
 *   object), reading values from environment variables set in Vercel.
 *
 * ENV VARS REQUIRED:
 *   ZAI_API_KEY     — the API key (typically starts with "Z.ai" for dev
 *                     sandbox or a real key for production)
 *   ZAI_BASE_URL    — defaults to https://internal-api.z.ai/v1
 *   ZAI_USER_ID     — optional, used for tracking
 *   ZAI_CHAT_ID     — optional, used for chat session tracking
 *   ZAI_TOKEN       — optional, JWT token if needed
 *
 * If ZAI_API_KEY is not set, getZai() throws a clear error so the route
 * handler can return a useful message instead of silently using fallback.
 */
import ZAI from "z-ai-web-dev-sdk";

export interface ZaiConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

let _cachedZai: ZAI | null = null;

/**
 * Returns a cached ZAI instance configured from env vars.
 * The instance is created once + reused — ZAI is stateless after construction.
 */
export function getZai(): ZAI {
  if (_cachedZai) return _cachedZai;

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ZAI_API_KEY environment variable is not set. Add it in Vercel " +
        "Project Settings → Environment Variables. The value should be your " +
        "Z.AI API key (e.g., 'Z.ai' for the dev sandbox or your real key).",
    );
  }

  const config: ZaiConfig = {
    baseUrl: process.env.ZAI_BASE_URL ?? "https://internal-api.z.ai/v1",
    apiKey,
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
