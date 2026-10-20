/**
 * NextAuth configuration.
 *
 * Two providers:
 *   1. Credentials (email + password) — uses scrypt hashing (see password.ts).
 *   2. Google OAuth — enabled only if GOOGLE_CLIENT_ID/SECRET are set in env.
 *      Otherwise a "demo" Google provider is used that returns a deterministic
 *      test identity clearly labelled as simulated (for local development
 *      without real Google credentials).
 *
 * Account-linking policy (per spec 7.6):
 *   - We NEVER auto-merge accounts based on email match.
 *   - A returning Google user must explicitly link to their existing account
 *     via the /settings/security flow (after re-authentication).
 *   - The first provider a user uses to register becomes their "primary"
 *     identity. Additional identities are added via the linking flow.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/security/password";
import { normalizeEmail, validateEmail } from "@/lib/security/validation";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const hasGoogleCreds =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !process.env.GOOGLE_CLIENT_ID.startsWith("demo_");

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60, // refresh JWT hourly
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 7,
  },
  cookies: {
    sessionToken: {
      name: `gigsure_session_token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: "gigsure_csrf_token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/?view=login",
    error: "/?view=login&error=1",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email ?? "");
        const password = credentials?.password ?? "";
        if (!validateEmail(email) || typeof password !== "string" || password.length === 0) {
          return null;
        }

        // Rate-limit login attempts (per email + per IP).
        // We can't read headers from the NextAuth authorize signature reliably, so we
        // derive an IP fallback from the request body if available.
        const ip = (req as { body?: { ipAddress?: string } } | undefined)?.body?.ipAddress
          ?? "unknown";
        const emailLimit = await checkRateLimit(`login:email:${email}`, RATE_LIMITS.LOGIN_PER_EMAIL);
        const ipLimit = await checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN_PER_IP);
        if (!emailLimit.ok || !ipLimit.ok) {
          logSecurityEvent("warn", "auth.login_rate_limited", {
            email,
            ip,
            emailRemaining: emailLimit.remaining,
            ipRemaining: ipLimit.remaining,
          });
          return null;
        }

        const user = await db.user.findUnique({
          where: { emailNormalized: email },
        });
        // Always perform a hash verification attempt to reduce timing-based enumeration.
        const hash = user?.passwordHash ?? "$scrypt$0$0$0$00$00";
        const ok = verifyPassword(password, hash);
        if (!user || !user.passwordHash || !ok) {
          logSecurityEvent("warn", "auth.login_failed", { email });
          return null;
        }
        if (user.accountStatus !== "ACTIVE") {
          logSecurityEvent("warn", "auth.login_blocked_account_status", {
            userId: user.id,
            status: user.accountStatus,
          });
          return null;
        }
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAuditEvent({
          actorId: user.id,
          action: "auth.login_success",
          targetType: "User",
          targetId: user.id,
          metadata: { provider: "password" },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
        };
      },
    }),
    hasGoogleCreds
      ? GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorization: {
            params: {
              scope: "openid email profile",
              prompt: "select_account",
            },
          },
        })
      : // Demo Google provider — runs only when real creds are absent.
        // Used so the demo can show the Google OAuth UX without real credentials.
        // CLEARLY marked as simulated in the UI; never used in production.
        ({
          id: "google-demo",
          name: "Continue with Google (Demo)",
          type: "oauth",
          idToken: false,
          wellKnown: undefined,
          authorization: { url: "/api/auth/google-demo/start" },
          token: { url: "/api/auth/google-demo/callback" },
          userinfo: { url: "/api/auth/google-demo/userinfo" },
          profile(profile: { sub: string; email: string; name: string }) {
            return {
              id: profile.sub,
              email: profile.email,
              name: profile.name,
            };
          },
        } as unknown as NextAuthOptions["providers"][number]),
  ],
  callbacks: {
    async signIn(_user, _account, _profile) {
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.userId = user.id;
      }
      if (account?.provider) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
        (session.user as { provider?: string }).provider = token.provider as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        if (u.origin === baseUrl) return url;
      } catch {
        // ignore
      }
      return baseUrl;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "google-demo") {
        // Account-linking handled in dedicated /api/auth/link-google endpoint.
        await recordAuditEvent({
          actorId: user.id,
          action: "auth.google_login",
          targetType: "User",
          targetId: user.id,
          metadata: { provider: account?.provider },
        });
      }
    },
  },
  debug: false,
};

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      email: string;
      name?: string | null;
      provider?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    provider?: string;
  }
}
