/**
 * Demo Google OAuth callback.
 *
 * Accepts a POST with { state, consentEmail, consentName } from the simulated
 * consent screen. Verifies the state cookie. Returns a synthetic OIDC `code`
 * that the NextAuth google-demo provider can exchange via the token endpoint.
 *
 * State mismatch → 400. Mismatched or missing state cookies are logged as
 * security events.
 */
import { NextResponse } from "next/server";
import { hashToken, constantTimeEqual, generateToken } from "@/lib/security/tokens";
import { normalizeEmail, validateEmail, sanitizeDisplayName } from "@/lib/security/validation";
import { logSecurityEvent } from "@/lib/auth/audit";

const issuedCodes = new Map<string, { sub: string; email: string; name: string; exp: number }>();

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

// Token endpoint — exchanges code for an id_token-like JWT.
export async function GET_token(req: Request) {
  return POST(req);
}

// Export the issuedCodes for the userinfo endpoint to consume.
export { issuedCodes };
