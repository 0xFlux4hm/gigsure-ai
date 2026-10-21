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
  // removed `'unsafe-inline'` and `'unsafe-eval'` from
  // script-src in production — both undermined the per-request nonce. With
  // both allowed, any HTML injection became executable JS.
  // In development, Next.js Turbopack HMR requires 'unsafe-eval' — we add
  // it back only in dev.
  // added report-uri + report-to for CSP violation
  // monitoring. Browsers POST violation reports to /api/csp-report.
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
    // CSP violation reporting
    `report-uri /api/csp-report`,
    `report-to gigsure-csp`,
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  // tightened Referrer-Policy to same-origin — prevents
  // leaking the app's origin to third parties when users click external links
  // (e.g., a link posted in a dispute message).
  res.headers.set("Referrer-Policy", "same-origin");
  // expanded Permissions-Policy to disable more browser
  // APIs we don't use (USB, Bluetooth, Payment Request, Serial, HID, sensors,
  // clipboard, gamepad) — reduces fingerprinting surface + XSS blast radius.
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), " +
      "usb=(), bluetooth=(), payment=(), serial=(), hid=(), " +
      "magnetometer=(), accelerometer=(), gyroscope=(), gamepad=(), " +
      "clipboard-read=(), clipboard-write=(), fullscreen=(self)",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  // COEP require-corp — defense in depth against
  // Spectre-class attacks that read cross-origin responses.
  res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  // Report-To header for CSP violation reporting.
  // Browsers use this to know where to send violation reports.
  res.headers.set(
    "Report-To",
    JSON.stringify({
      group: "gigsure-csp",
      max_age: 86400,
      endpoints: [{ url: "/api/csp-report" }],
    }),
  );

  if (isProduction) {
    // HSTS: 1 year, include subdomains, ready for preload list
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  // Apply to all routes except Next.js internals, static assets, and the
  // CSP report endpoint (which must return 204 without extra headers).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|images/|api/csp-report).*)"],
};
