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
  // - 'self' for scripts/styles/images/fonts
  // - Allow Google fonts + avatar inline styles
  // - Allow Google OIDC redirects (accounts.google.com)
  // - Allow data: for images (shadcn/ui avatars use data URIs)
  // - 'unsafe-inline' for styles (Next.js requires it for now; nonce can be added later)
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`,
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
