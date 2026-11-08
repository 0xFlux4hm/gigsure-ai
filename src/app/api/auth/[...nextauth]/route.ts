import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/nextauth-config";

// trustHost: true in authOptions lets NextAuth auto-detect the host from
// the request's Host header. This is the recommended approach for Vercel.
//
// Do NOT set NEXTAUTH_URL as a Vercel env var — it can cause redirect
// mismatches between preview and production deployments.
//
// If you need a canonical production URL (e.g., for email links), set
// NEXTAUTH_URL_PRODUCTION instead. But for the auth flow itself, trustHost
// handles everything correctly.

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
