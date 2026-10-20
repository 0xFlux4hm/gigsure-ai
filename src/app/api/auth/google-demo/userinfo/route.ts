/**
 * Demo Google OAuth userinfo endpoint.
 *
 * Accepts the access_token (== the code we issued), returns the demo user
 * profile. Token must be valid and not expired.
 */
import { NextResponse } from "next/server";
import { issuedCodes } from "../callback/route";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const record = issuedCodes.get(token);
  if (!record) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  if (record.exp < Date.now()) {
    issuedCodes.delete(token);
    return NextResponse.json({ error: "expired_token" }, { status: 401 });
  }
  return NextResponse.json({
    sub: record.sub,
    email: record.email,
    name: record.name,
    email_verified: true,
  });
}
