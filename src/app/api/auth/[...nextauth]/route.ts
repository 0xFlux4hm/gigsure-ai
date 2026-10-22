import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/nextauth-config";

// On Vercel, NEXTAUTH_URL may be hardcoded to an old deployment URL in the
// environment variables. This causes login to redirect to the wrong domain
// (the session cookie is set for the current domain, but the redirect goes
// to NEXTAUTH_URL's domain → user appears logged out → bounces to login).
//
// Fix: when on Vercel, override NEXTAUTH_URL to the current deployment's
// URL so the redirect stays on the same domain the user is on.
//
// - VERCEL_URL is set automatically by Vercel for every deployment
//   (format: <project-name>-<hash>-<team>.vercel.app)
// - VERCEL_ENV is "production" | "preview" | "development"
//
// For production deployments, use the canonical production URL if set.
// For preview deployments, use VERCEL_URL (the current deployment's URL).
if (process.env.VERCEL) {
  if (process.env.VERCEL_ENV === "production" && process.env.NEXTAUTH_URL_PRODUCTION) {
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL_PRODUCTION;
  } else if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
  }
  // If neither condition matches, trustHost:true in the config will
  // auto-detect from the request headers.
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
