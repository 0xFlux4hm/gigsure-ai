import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/nextauth-config";

// On Vercel, NEXTAUTH_URL is often set as an environment variable to a
// specific deployment URL. This breaks login because:
//   1. User visits deployment A (e.g., gigsure-ai-git-main-...vercel.app)
//   2. Login succeeds, session cookie is set for deployment A's domain
//   3. NextAuth redirects to NEXTAUTH_URL (deployment B's domain)
//   4. Session cookie doesn't exist on deployment B → user appears logged out
//   5. User bounces back to login page
//
// Fix: delete NEXTAUTH_URL at runtime so NextAuth's trustHost:true option
// auto-detects the host from the request's Host header. This ensures the
// redirect URL always matches the domain the user is currently browsing.
//
// For production deployments, set NEXTAUTH_URL_PRODUCTION in Vercel env vars
// to your canonical domain (e.g., https://gigsure-ai.vercel.app) — this is
// used ONLY for production, not for preview deployments.
if (process.env.VERCEL) {
  if (process.env.VERCEL_ENV === "production" && process.env.NEXTAUTH_URL_PRODUCTION) {
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL_PRODUCTION;
  } else {
    // For preview deployments, delete NEXTAUTH_URL so trustHost:auto-detects
    // from the request's Host header (the URL the user is actually on).
    delete process.env.NEXTAUTH_URL;
  }
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
