/**
 * API helper: standard JSON responses + error envelope.
 *
 * SECURITY (2026-10):
 *   - parseJsonBody enforces 1 MiB body-size cap (DoS protection).
 *   - apiRoute no longer echoes raw `err.message` for unknown errors with a
 *     `status` field — only whitelisted error classes (AuthnError, AuthzError,
 *     PaymentProviderError) return their message. Everything else returns
 *     generic "Internal server error".
 *   - Zod validation errors no longer echo `issues` to client (prevents
 *     schema probing). Issues are logged server-side instead.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthnError, AuthzError } from "@/lib/auth/authorization";
import { logSecurityEvent } from "@/lib/auth/audit";
import { PaymentProviderError } from "@/lib/payments/mock-provider";

export type ApiHandler<T> = (req: Request, ctx: { params: Record<string, string> }) => Promise<T>;

export function ok<T>(data: T, status = 200) {
  // never cache authenticated API responses —
  // prevents cross-user PII leaks at CDN edges / intermediate proxies.
  return NextResponse.json(
    { ok: true, data },
    {
      status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...extra },
    {
      status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}

export function apiRoute<T>(
  handler: ApiHandler<T>,
): (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req, ctx) => {
    try {
      const params = await ctx.params;
      const data = await handler(req, { params });
      // If the handler already returned a NextResponse (e.g., via ok() or fail()),
      // pass it through unchanged.
      if (data instanceof NextResponse) return data;
      return ok(data);
    } catch (err) {
      // Whitelist of error classes whose messages are safe to return.
      if (err instanceof AuthnError) {
        return fail(err.message, err.status);
      }
      if (err instanceof AuthzError) {
        return fail(err.message, err.status);
      }
      if (err instanceof PaymentProviderError) {
        return fail(err.message, err.status);
      }
      if (err instanceof ZodError) {
        // log issues server-side only — don't echo to client
        // (prevents schema-probing reconnaissance).
        logSecurityEvent("warn", "api.validation_failed", {
          issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
        });
        return fail("Validation failed", 422);
      }
      if (err instanceof SyntaxError) {
        return fail("Invalid JSON body", 400);
      }
      // removed the generic `e?.status && e?.message` branch —
      // third-party errors (Prisma, z-ai SDK, nodemailer) can carry .status
      // + .message with internal context (hostnames, query fragments,
      // connection strings). All unknown errors return generic 500.
      logSecurityEvent("error", "api.unhandled_error", {
        name: (err as Error)?.name,
        message: (err as Error)?.message,
        stack: (err as Error)?.stack?.split("\n").slice(0, 5),
      });
      // Never leak stack traces or internal messages to the client.
      return fail("Internal server error", 500);
    }
  };
}

/** Maximum JSON request body size — 1 MiB. */
const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024;

/** Parse JSON body with size cap (DoS protection). Throws SyntaxError on malformed/oversized. */
export async function parseJsonBody<T = unknown>(req: Request): Promise<T> {
  // Check Content-Length first (fast path — rejects before reading body).
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_JSON_BODY_BYTES) {
    throw new SyntaxError("Request body too large");
  }
  const text = await req.text();
  // Defense in depth: also check actual body length in case Content-Length was missing/spoofed.
  if (text.length > MAX_JSON_BODY_BYTES) {
    throw new SyntaxError("Request body too large");
  }
  if (!text) return {} as T;
  // strip __proto__ / constructor keys to defend against prototype
  // pollution if any caller ever spreads the parsed result into an object.
  const parsed = JSON.parse(text) as T;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    delete obj.__proto__;
    delete obj.constructor;
    delete obj.prototype;
  }
  return parsed;
}

export function getQueryParam(req: Request, key: string): string | null {
  const url = new URL(req.url);
  // cap query param length (defense in depth against search DoS).
  const v = url.searchParams.get(key);
  if (v && v.length > 500) return v.slice(0, 500);
  return v;
}

export function getQueryInt(req: Request, key: string, def = 0): number {
  const v = getQueryParam(req, key);
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}
