/**
 * Resolve the base URL for the current deployment.
 *
 * Used to construct links in emails (verification, password reset, etc.)
 * that point back to the correct deployment URL the user is browsing.
 *
 * SECURITY: Only trusts hostnames from an allowlist or from Vercel's
 * built-in VERCEL_URL env var. The X-Forwarded-Host / Host headers are
 * checked against an allowlist to prevent host header injection attacks
 * that could redirect password-reset / verification tokens to an
 * attacker-controlled domain.
 *
 * Resolution order:
 *   1. NEXTAUTH_URL_PRODUCTION env var (if on Vercel production)
 *   2. VERCEL_URL env var (Vercel sets this — trusted)
 *   3. Host header IF it matches the allowlist (configured via ALLOWED_HOSTS env var)
 *   4. NEXTAUTH_URL env var (dev / non-Vercel)
 *   5. Final fallback: http://localhost:3000 (dev only)
 */

export function resolveBaseUrl(req?: Request): string {
  // 1. Vercel production with explicit production URL
  if (process.env.VERCEL_ENV === "production" && process.env.NEXTAUTH_URL_PRODUCTION) {
    return process.env.NEXTAUTH_URL_PRODUCTION.replace(/\/$/, "");
  }

  // 2. VERCEL_URL env var (Vercel sets this automatically — trusted)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 3. Auto-detect from the request's Host header — but ONLY if it matches
  // the allowlist. In production, ALWAYS use https:// (never trust
  // client-supplied x-forwarded-proto).
  if (req) {
    const hostHeader = req.headers.get("host");
    const forwardedHost = req.headers.get("x-forwarded-host");
    // SECURITY: Always use https in production; only allow http in dev
    const forwardedProto = process.env.NODE_ENV === "production"
      ? "https"
      : (req.headers.get("x-forwarded-proto") ?? "https");

    // Prefer Host header (set by the web server, not the client)
    const effectiveHost = hostHeader ?? forwardedHost;

    if (effectiveHost && isAllowedHost(effectiveHost)) {
      return `${forwardedProto}://${effectiveHost}`;
    }
  }

  // 4. NEXTAUTH_URL env var (still used in dev / non-Vercel)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }

  // 5. Final fallback — dev only
  return "http://localhost:3000";
}

/**
 * Check if a hostname is in the allowlist.
 * The allowlist is configured via the ALLOWED_HOSTS env var (comma-separated).
 * If ALLOWED_HOSTS is not set, only localhost and vercel.app subdomains are allowed.
 */
function isAllowedHost(host: string): boolean {
  // Normalize: strip port, lowercase
  const hostname = host.split(":")[0].toLowerCase().trim();

  // If no explicit allowlist is configured, only allow the canonical
  // production domain (if set) and localhost for dev.
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  // SECURITY: Only trust NEXTAUTH_URL_PRODUCTION domain in production
  // (prevents *.vercel.app blanket trust — anyone can create a Vercel
  // preview deployment with a similar name)
  if (process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL_PRODUCTION) {
    const prodHost = process.env.NEXTAUTH_URL_PRODUCTION
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .toLowerCase();
    return hostname === prodHost || hostname.endsWith("." + prodHost);
  }

  // Non-production: allow vercel.app subdomains for preview deployments
  if (process.env.NODE_ENV !== "production" && hostname.endsWith(".vercel.app")) {
    return true;
  }

  return false;
}
