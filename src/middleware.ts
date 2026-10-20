/**
 * Security headers middleware.
 *
 * Applied to every response from the app:
 *   - Content-Security-Policy (mitigates XSS, clickjacking, injection)
 *   - Strict-Transport-Security (forces HTTPS, 1 year + preload)
 *   - X-Frame-Options: DENY (no iframe embedding)
 *   - X-Content-Type-Options: nosniff (no MIME sniffing)
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy (disable camera/mic/geolocation we don't use)
 *   - X-DNS-Prefetch-Control: off (no DNS prefetch leak)
 *
 * In production: HSTS preload list submission is recommended after validation
 * at https://hstspreload.org/
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const isProduction = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // CSP: restricts where resources can be loaded from.
  // SECURITY (2026-10): removed `'unsafe-inline'` and `'unsafe-eval'` from
  // script-src in production — both undermined the per-request nonce. With
  // both allowed, any HTML injection became executable JS.
  // In development, Next.js Turbopack HMR requires 'unsafe-eval' — we add
  // it back only in dev.
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}'`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`;
  const csp = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://accounts.google.com https://fonts.googleapis.com`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://accounts.google.com`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (isProduction) {
    // HSTS: 1 year, include subdomains, ready for preload list
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  // Apply to all routes except Next.js internals + static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|images/).*)"],
};
