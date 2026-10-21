/**
 * Health check endpoint.
 *
 * Used by:
 *   - Docker HEALTHCHECK directive
 *   - Caddy reverse proxy health_uri
 *   - Kubernetes liveness/readiness probes
 *   - Load balancer health checks
 *
 * Returns:
 *   200 OK with {"status":"healthy", ...} if all dependencies are up
 *   503 Service Unavailable with {"status":"unhealthy", ...} if any check fails
 *
 * Checks:
 *   - Database connectivity (SELECT 1)
 *   - (Future: Redis, AI provider, payment provider)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logSecurityEvent } from "@/lib/auth/audit";

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Database check
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    // never expose raw Prisma error message on an
    // unauthenticated endpoint — leaks internal hostnames/ports during outages.
    logSecurityEvent("error", "health.database_down", {
      message: (err as Error).message.slice(0, 100),
    });
    checks.database = { ok: false };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? "healthy" : "unhealthy";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      environment: process.env.NODE_ENV ?? "unknown",
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
