/**
 * Demo Google OAuth start endpoint.
 *
 * Used ONLY when real GOOGLE_CLIENT_ID/SECRET are not configured. This
 * generates a state token, stores it in a short-lived cookie, and redirects
 * to a simulated Google consent screen at `/?view=google-demo-consent&state=...`.
 *
 * In production, this route is never matched (NextAuth's real Google provider
 * takes over).
 */
import { NextResponse } from "next/server";
import { generateToken, hashToken } from "@/lib/security/tokens";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const callbackUrl = url.searchParams.get("callbackUrl") ?? "/";
  const state = generateToken(16);

  // Set short-lived state cookie (10 min). Verified on callback.
  const res = NextResponse.redirect(
    new URL(`/?view=google-demo-consent&state=${state}&callbackUrl=${encodeURIComponent(callbackUrl)}`, url.origin),
  );
  res.cookies.set("gigsure_oauth_state", hashToken(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}
