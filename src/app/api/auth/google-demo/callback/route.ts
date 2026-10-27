/**
 * Demo Google OAuth callback.
 *
 * Accepts a POST with { state, consentEmail, consentName } from the simulated
 * consent screen. Verifies the state cookie. Returns a synthetic OIDC `code`
 * that the NextAuth google-demo provider can exchange via the token endpoint.
 *
 * State mismatch → 400. Mismatched or missing state cookies are logged as
 * security events.
 *
 * SECURITY (2026-10):
 *   - issuedCodes Map is now bounded at 10,000 entries with periodic sweep
 *     (prevents memory-exhaustion DoS).
 *   - Removed dead GET_token export (Next.js doesn't recognize it; it's
 *     silently ignored — only GET/POST/PUT/PATCH/DELETE work).
 */
import { NextResponse } from "next/server";
import { hashToken, constantTimeEqual, generateToken } from "@/lib/security/tokens";
import { normalizeEmail, validateEmail, sanitizeDisplayName } from "@/lib/security/validation";
import { logSecurityEvent } from "@/lib/auth/audit";

const MAX_ISSUED_CODES = 10_000;
const issuedCodes = new Map<string, { sub: string; email: string; name: string; exp: number }>();

// Sweep expired entries — called on every insert.
function sweepExpiredCodes() {
  const now = Date.now();
  for (const [k, v] of issuedCodes) {
    if (v.exp < now) issuedCodes.delete(k);
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const stateFromQuery = url.searchParams.get("state") ?? "";
  const stateCookie = req.headers.get("cookie") ?? "";
  const stateCookieMatch = stateCookie.match(/gigsure_oauth_state=([^;]+)/);
  const stateCookieHash = stateCookieMatch?.[1] ?? "";

  if (!stateFromQuery || !stateCookieHash) {
    logSecurityEvent("warn", "oauth_demo.missing_state");
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }
  if (!constantTimeEqual(hashToken(stateFromQuery), stateCookieHash)) {
    logSecurityEvent("warn", "oauth_demo.state_mismatch");
    return NextResponse.json({ error: "State mismatch" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    consentEmail?: string;
    consentName?: string;
  };
  const email = normalizeEmail(body.consentEmail ?? "");
  const name = sanitizeDisplayName(body.consentName ?? "Demo User");
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // SECURITY: sweep expired entries + enforce size cap (DoS protection).
  sweepExpiredCodes();
  if (issuedCodes.size >= MAX_ISSUED_CODES) {
    logSecurityEvent("warn", "oauth_demo.codes_capacity_reached", { size: issuedCodes.size });
    return NextResponse.json({ error: "Server busy, please try again" }, { status: 503 });
  }

  // Issue a synthetic OIDC code valid for 60s.
  const code = generateToken(16);
  issuedCodes.set(code, {
    sub: `demo_${hashToken(email).slice(0, 16)}`,
    email,
    name,
    exp: Date.now() + 60_000,
  });

  const res = NextResponse.json({ code, redirect_uri: url.origin + "/api/auth/callback/google-demo" });
  res.cookies.delete("gigsure_oauth_state");
  return res;
}

// Export the issuedCodes for the userinfo endpoint (and the link-google route)
// to consume.
export { issuedCodes };
