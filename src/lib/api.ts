/**
 * API helper: standard JSON responses + error envelope.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthnError, AuthzError } from "@/lib/auth/authorization";
import { logSecurityEvent } from "@/lib/auth/audit";

export type ApiHandler<T> = (req: Request, ctx: { params: Record<string, string> }) => Promise<T>;

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
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
      if (err instanceof AuthnError) {
        return fail(err.message, err.status);
      }
      if (err instanceof AuthzError) {
        return fail(err.message, err.status);
      }
      if (err instanceof ZodError) {
        return fail("Validation failed", 422, { issues: err.issues });
      }
      if (err instanceof SyntaxError) {
        return fail("Invalid JSON body", 400);
      }
      // Custom app errors with status
      const e = err as { status?: number; message?: string };
      if (e?.status && e?.message) {
        return fail(e.message, e.status);
      }
      logSecurityEvent("error", "api.unhandled_error", {
        message: (err as Error)?.message,
        stack: (err as Error)?.stack?.split("\n").slice(0, 5),
      });
      // Never leak stack traces to the client.
      return fail("Internal server error", 500);
    }
  };
}

/** Parse JSON body, throwing a friendly 400 on malformed input. */
export async function parseJsonBody<T = unknown>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function getQueryParam(req: Request, key: string): string | null {
  const url = new URL(req.url);
  return url.searchParams.get(key);
}

export function getQueryInt(req: Request, key: string, def = 0): number {
  const v = getQueryParam(req, key);
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}
