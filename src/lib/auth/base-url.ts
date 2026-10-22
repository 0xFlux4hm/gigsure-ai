/**
 * Resolve the base URL for the current deployment.
 *
 * Used to construct links in emails (verification, password reset, etc.)
 * that point back to the correct deployment URL the user is browsing.
 *
 * Resolution order:
 *   1. If on Vercel production + NEXTAUTH_URL_PRODUCTION set → use it
 *      (canonical production domain, e.g. https://gigsure-ai.vercel.app)
 *   2. If the request has an x-forwarded-host or host header → use it
 *      (auto-detects the deployment URL the user is browsing, e.g. the
 *      preview deployment URL)
 *   3. Fall back to VERCEL_URL env var (Vercel sets this automatically)
 *   4. Fall back to NEXTAUTH_URL env var
 *   5. Final fallback: http://localhost:3000 (dev only)
 *
 * Critical: previously this used NEXTAUTH_URL alone, but we delete
 * NEXTAUTH_URL on Vercel previews (so trustHost can auto-detect for
 * NextAuth session cookies). Without this helper, verification emails
 * sent from preview deployments contained a `http://localhost:3000`
 * link — clicking it took users to a broken page.
 */

export function resolveBaseUrl(req?: Request): string {
  // 1. Vercel production with explicit production URL
  if (process.env.VERCEL_ENV === "production" && process.env.NEXTAUTH_URL_PRODUCTION) {
    return process.env.NEXTAUTH_URL_PRODUCTION.replace(/\/$/, "");
  }

  // 2. Auto-detect from the request's Host header
  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = forwardedHost ?? req.headers.get("host");
    if (host) {
      return `${forwardedProto}://${host}`;
    }
  }

  // 3. VERCEL_URL env var (Vercel sets this for every deployment)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 4. NEXTAUTH_URL env var (still used in dev / non-Vercel)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }

  // 5. Final fallback — dev only
  return "http://localhost:3000";
}
