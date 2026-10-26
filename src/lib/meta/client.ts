/**
 * Meta Model API client adapter.
 *
 * Single entry point for all Meta model calls in GigSure. Every other module
 * calls these helpers; nothing else in the codebase should touch the Meta API
 * directly. This keeps auth, retries, timeouts, and error handling in one place.
 *
 * Endpoints (all under https://api.meta.ai/v1):
 *   - Chat Completions (OpenAI-compatible): /v1/chat/completions
 *   - Responses API (Meta's preferred):     /v1/responses
 *   - Voice transcription:                  /v1/asr/transcribe
 *   - Image generation:                     /v1/images/generations
 *
 * Auth: Authorization: Bearer LLM_<key> (per https://dev.meta.ai/docs/authentication)
 *
 * Models (per https://dev.meta.ai/docs/models):
 *   - Muse Spark (default, agentic):  muse-spark-1.3 | muse-spark-1.3-contributor
 *   - Muse Wonder (deep reasoning):  muse-wonder-1.0
 *   - Muse Voice Transcribe:         muse-voice-transcribe-1.0
 *   - Muse Image:                    muse-image-1.0
 *   - SAM 3.1:                       sam-3.1
 *
 * Pricing (per https://dev.meta.ai/docs/pricing):
 *   Muse Spark 1.3 Standard:   $1.25 / M input, $4.25 / M output
 *   Muse Spark 1.3 Contributor: $0.10 / M input, $0.20 / M output  (Meta may use content for training)
 *   Muse Wonder 1.0:            see pricing page
 *
 * For hackathon demo, we use Standard mode by default (safer for sensitive
 * contract / dispute content). Contributor mode is opt-in via env var.
 */
import { logSecurityEvent } from "@/lib/auth/audit";

const META_API_BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
const META_API_KEY = process.env.META_API_KEY;

// Default model selection. Override per-call if needed.
// Use Contributor mode if META_USE_CONTRIBUTOR_MODE=true (cheaper, but Meta
// may use content for training — never set this for sensitive contract data).
const DEFAULT_CHAT_MODEL =
  process.env.META_USE_CONTRIBUTOR_MODE === "true"
    ? "muse-spark-1.3-contributor"
    : "muse-spark-1.3";

// Reasoning-focused model for contract review, risk analysis (multi-step).
const REASONING_CHAT_MODEL = "muse-wonder-1.0";

// Voice + image models are fixed (no contributor variant).
const VOICE_TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const IMAGE_GENERATION_MODEL = "muse-image-1.0";

export const META_MODELS = {
  CHAT: DEFAULT_CHAT_MODEL,
  REASONING: REASONING_CHAT_MODEL,
  VOICE_TRANSCRIBE: VOICE_TRANSCRIBE_MODEL,
  IMAGE: IMAGE_GENERATION_MODEL,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatCompletionOptions {
  /** Model to use. Defaults to Muse Spark (Standard). */
  model?: string;
  /** Conversation messages (OpenAI format). */
  messages: ChatMessage[];
  /** Max output tokens. Hard cap to prevent runaway costs. */
  maxTokens?: number;
  /** 0.0 - 1.0. Lower = more deterministic. */
  temperature?: number;
  /** Abort after this many ms. Default 60s (matches vercel.json maxDuration). */
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  content: string;
  /** Input tokens billed. */
  inputTokens: number;
  /** Output tokens billed. */
  outputTokens: number;
  /** Model used (echoed back for audit). */
  model: string;
}

export interface VoiceTranscribeOptions {
  /** Audio file as a Buffer (mp3, wav, m4a, ogg, webm). */
  audio: Buffer;
  /** MIME type, e.g. "audio/mpeg", "audio/wav", "audio/webm". */
  mimeType: string;
  /** Optional filename for the API (some providers require it). */
  filename?: string;
  /** Optional language hint. ISO 639-1 (e.g. "yo" for Yoruba, "ig" for Igbo, "ha" for Hausa, "en" for English). */
  language?: string;
  /** Abort after this many ms. Default 90s (voice files can be large). */
  timeoutMs?: number;
}

export interface VoiceTranscribeResult {
  /** The full transcribed text. */
  text: string;
  /** Detected language (if auto-detected). */
  language?: string;
  /** Duration of the audio in seconds. */
  durationSeconds?: number;
}

export class MetaApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Internal: fetch wrapper with auth, retries, timeouts
// ---------------------------------------------------------------------------

async function metaFetch<T>(path: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
  if (!META_API_KEY) {
    throw new MetaApiError(
      "META_API_KEY not set. Add it to .env.local (see HACKATHON.md).",
      500,
      "missing_api_key",
    );
  }

  const { timeoutMs = 60_000, ...rest } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const url = path.startsWith("http") ? path : `${META_API_BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${META_API_KEY}`,
        "Content-Type": "application/json",
        ...rest.headers,
      },
      signal: controller.signal,
    });

    // Empty body → return null
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const errMsg = (body as { error?: { message?: string; code?: string } })?.error?.message ?? `Meta API error ${res.status}`;
      const errCode = (body as { error?: { code?: string } })?.error?.code;
      // Log without leaking the key
      logSecurityEvent("warn", "meta.api_error", {
        path,
        status: res.status,
        code: errCode,
        message: errMsg,
      });
      throw new MetaApiError(errMsg, res.status, errCode);
    }

    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public: chat completions (OpenAI-compatible)
// ---------------------------------------------------------------------------

interface ChatCompletionAPIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call Muse Spark (or Muse Wonder) for a chat completion.
 *
 * Use this for the 7 AI assistants. For Contract + Risk assistants, pass
 * `model: META_MODELS.REASONING` to use Muse Wonder.
 *
 * Cost guardrails:
 *   - maxTokens defaults to 800 (plenty for assistant responses, ~$0.003/call on Standard)
 *   - Hard cap at 4000 tokens (~$0.017/call) — callers cannot exceed this
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const model = opts.model ?? DEFAULT_CHAT_MODEL;
  const maxTokens = Math.min(opts.maxTokens ?? 800, 4000);

  const body = {
    model,
    messages: opts.messages,
    max_tokens: maxTokens,
    temperature: opts.temperature ?? 0.4,
  };

  const res = await metaFetch<ChatCompletionAPIResponse>("/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: opts.timeoutMs ?? 60_000,
  });

  const choice = res.choices?.[0];
  if (!choice) {
    throw new MetaApiError("Meta returned no choices", 502, "empty_response");
  }

  return {
    content: choice.message.content,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    model: res.model,
  };
}

// ---------------------------------------------------------------------------
// Public: voice transcription (Muse Voice Transcribe)
// ---------------------------------------------------------------------------

interface VoiceTranscribeAPIResponse {
  text: string;
  language?: string;
  duration?: number;
}

/**
 * Transcribe an audio file using Muse Voice Transcribe.
 *
 * USE CASE (hackathon feature): a Nigerian freelancer uploads a WhatsApp voice
 * note as dispute evidence. We transcribe it so the dispute timeline has
 * searchable text — including Nigerian Pidgin, Yoruba, Hausa, Igbo. Meta's
 * voice model is uniquely strong on these languages vs. Google/Deepgram.
 *
 * Accepted audio types: mp3, wav, m4a, ogg, webm. Max file size: 25 MB.
 */
export async function transcribeVoice(opts: VoiceTranscribeOptions): Promise<VoiceTranscribeResult> {
  if (opts.audio.length > 25 * 1024 * 1024) {
    throw new MetaApiError("Audio file exceeds 25 MB limit", 413, "file_too_large");
  }

  // multipart/form-data — audio is binary, can't be JSON-encoded
  // Copy Buffer bytes into a fresh ArrayBuffer so Blob accepts it
  // (Node Buffer.buffer can be SharedArrayBuffer in some runtimes, which Blob rejects.)
  const audioBytes = new Uint8Array(opts.audio.byteLength);
  audioBytes.set(opts.audio);
  const ab = audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength) as ArrayBuffer;
  const formData = new FormData();
  const blob = new Blob([ab], { type: opts.mimeType });
  formData.append("file", blob, opts.filename ?? "audio.webm");
  formData.append("model", VOICE_TRANSCRIBE_MODEL);
  if (opts.language) {
    formData.append("language", opts.language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

  try {
    const res = await fetch(`${META_API_BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_API_KEY}`,
      },
      body: formData,
      signal: controller.signal,
    });

    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const errMsg = (body as { error?: { message?: string } })?.error?.message ?? `Voice API ${res.status}`;
      throw new MetaApiError(errMsg, res.status);
    }

    const data = body as VoiceTranscribeAPIResponse;
    return {
      text: data.text,
      language: data.language,
      durationSeconds: data.duration,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public: image generation (Muse Image)
// ---------------------------------------------------------------------------

interface ImageGenerationAPIResponse {
  data: Array<{ url?: string; b64_json?: string }>;
}

export interface ImageGenerationOptions {
  prompt: string;
  /** Image size. Defaults to 1024x1024 (square). */
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  /** Abort after this many ms. Default 90s (image gen is slow). */
  timeoutMs?: number;
}

export interface ImageGenerationResult {
  /** Image URL (hosted by Meta) OR base64 data URL. */
  imageUrl: string;
}

/**
 * Generate an image using Muse Image.
 *
 * USE CASE (hackathon feature): a freelancer describes a deliverable ("logo
 * for a fintech startup, blue and green, geometric"). Muse Image generates a
 * preview so the client and freelancer align before work starts.
 */
export async function generateImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const body = {
    model: IMAGE_GENERATION_MODEL,
    prompt: opts.prompt,
    n: 1,
    size: opts.size ?? "1024x1024",
  };

  const res = await metaFetch<ImageGenerationAPIResponse>("/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: opts.timeoutMs ?? 90_000,
  });

  const item = res.data?.[0];
  if (!item) {
    throw new MetaApiError("Muse Image returned no images", 502, "empty_response");
  }
  if (item.b64_json) {
    return { imageUrl: `data:image/png;base64,${item.b64_json}` };
  }
  if (item.url) {
    return { imageUrl: item.url };
  }
  throw new MetaApiError("Muse Image response missing both url and b64_json", 502, "malformed_response");
}

// ---------------------------------------------------------------------------
// Public: connectivity check (used by HACKATHON.md verification step)
// ---------------------------------------------------------------------------

interface ModelsListResponse {
  object: string;
  data: Array<{ id: string }>;
}

/**
 * Verify the API key works AND the account has access to models.
 *
 * Returns the list of model IDs the account can use. If the account is
 * frozen (billing hold), this returns an empty list — call this first
 * before any chat/transcribe/image call to fail fast with a clear error.
 */
export async function listAvailableModels(): Promise<string[]> {
  const res = await metaFetch<ModelsListResponse>("/models", {
    method: "GET",
    timeoutMs: 10_000,
  });
  return (res.data ?? []).map((m) => m.id);
}

/**
 * Smoke test: returns true if the account can actually call a model.
 * Use this in dev to confirm billing is unfrozen before debugging deeper.
 */
export async function isAccountActive(): Promise<{ active: boolean; reason?: string }> {
  if (!META_API_KEY) {
    return { active: false, reason: "META_API_KEY not set in .env.local" };
  }
  try {
    const models = await listAvailableModels();
    if (models.length === 0) {
      return {
        active: false,
        reason:
          "API key is valid but account has no accessible models. Check billing at https://dev.meta.ai — likely a payment-method freeze.",
      };
    }
    return { active: true };
  } catch (err) {
    return {
      active: false,
      reason: (err as Error).message,
    };
  }
}
