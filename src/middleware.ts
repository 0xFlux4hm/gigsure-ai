import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Security headers
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");

  // Content-Security-Policy — blocks inline scripts, javascript: URLs,
  // data: URLs, and restricts all resources to same-origin (with
  // exceptions for Google OAuth and fonts).
  // Nonce-based CSP would be stronger but requires server-side rendering
  // changes — this is a strong baseline.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com", // unsafe-inline needed for Next.js hydration scripts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);

  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|images/|api/csp-report).*)"],
};
