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
import { verifyPassword, getDecoyPasswordHash } from "@/lib/security/password";
import { normalizeEmail, validateEmail, isSafeRedirect } from "@/lib/security/validation";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const hasGoogleCreds =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !process.env.GOOGLE_CLIENT_ID.startsWith("demo_");

export const authOptions: NextAuthOptions = {
  // explicitly set secret (was implicit via env var).
  // Fail loudly in production if NEXTAUTH_SECRET is missing.
  secret: (() => {
    const s = process.env.NEXTAUTH_SECRET;
    if (!s && process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must be set in production. Generate with: openssl rand -base64 32");
    }
    return s;
  })(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60, // refresh JWT hourly
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 7,
  },
  cookies: {
    // use __Secure- / __Host- prefixes in production.
    //   __Secure- → browser refuses to set the cookie over HTTP (downgrade defense)
    //   __Host-   → browser refuses to set the cookie from any subdomain (no Domain attr, Path=/)
    // NextAuth v4 normally applies these automatically when useSecureCookies=true,
    // but our explicit override was stripping them. Restore them here.
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-gigsure_session_token"
        : "gigsure_session_token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Host-gigsure_csrf_token"
        : "gigsure_csrf_token",
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

        // derive IP from request headers, NOT from
        // req.body.ipAddress (which was fully attacker-controlled — bypassed
        // the per-IP rate limit trivially). NextAuth passes the NextRequest
        // as `req`. We trust the leftmost X-Forwarded-For entry as the
        // client IP — if you're behind a CDN that overwrites this header
        // (recommended), this is correct. If your CDN appends, an attacker
        // can still spoof the leftmost — but Vercel/Cloudflare overwrite.
        const headers = (req as { headers?: Record<string, string | string[]> } | undefined)?.headers;
        const xff = headers?.["x-forwarded-for"] ?? headers?.["x-forwarded-for".toLowerCase()];
        const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? "unknown";

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
        // use a real scrypt-formatted decoy hash so
        // verifyPassword runs the full scryptSync path even when the user
        // doesn't exist. Previously the decoy was "$scrypt$..." which failed
        // the startsWith("scrypt:") check immediately, leaking timing info.
        const hash = user?.passwordHash ?? getDecoyPasswordHash();
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
      : null,
  ].filter(Boolean) as NextAuthOptions["providers"],
  callbacks: {
    async signIn(_user, _account, _profile) {
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      if (user?.id) {
        token.userId = user.id;
        // record issuedAt so we can invalidate the
        // session after a password change/reset (see jwt callback below).
        token.issuedAt = Date.now();
        // generate a unique JTI per JWT so individual
        // sessions can be revoked without logging out all sessions.
        token.jti = crypto.randomUUID();
      }
      if (account?.provider) {
        token.provider = account.provider;
      }
      // handle session update trigger from /api/auth/reauth.
      // When the frontend calls `await update({ sudo: true })` after reauth,
      // we refresh issuedAt so requireRecentAuth() passes for 15 minutes.
      if (trigger === "update" && session?.sudo === true) {
        token.issuedAt = Date.now();
      }
      // if the user has changed their password since
      // this JWT was issued, force re-authentication by returning an empty
      // token (NextAuth treats this as "not authenticated").
      if (token.userId && token.issuedAt) {
        const u = await db.user.findUnique({
          where: { id: token.userId as string },
          select: { passwordChangedAt: true, accountStatus: true },
        });
        if (!u || u.accountStatus !== "ACTIVE") {
          // User deleted or suspended — invalidate session
          return { ...token, userId: undefined } as typeof token;
        }
        if (u.passwordChangedAt && u.passwordChangedAt.getTime() > (token.issuedAt as number)) {
          // Password changed after this JWT was issued — invalidate
          return { ...token, userId: undefined } as typeof token;
        }
        // check if this specific session (JTI) has been
        // revoked. This enables per-session revocation (e.g., "sign out my
        // lost phone") without the all-or-nothing passwordChangedAt approach.
        if (token.jti) {
          const revoked = await db.revokedSession.findUnique({
            where: { jti: token.jti as string },
            select: { id: true },
          });
          if (revoked) {
            return { ...token, userId: undefined } as typeof token;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
        (session.user as { provider?: string }).provider = token.provider as string;
        // expose JTI + issuedAt so the frontend can:
        //   - Display the current session's JTI for "this device" labeling
        //   - Check requireRecentAuth status locally before calling sensitive endpoints
        //   - Call /api/auth/sessions/[jti] DELETE to revoke this session
        (session.user as { jti?: string }).jti = token.jti as string;
        (session.user as { issuedAt?: number }).issuedAt = token.issuedAt as number;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // use isSafeRedirect (rejects scheme, protocol-relative,
      // backslash, CRLF, control chars) instead of loose startsWith("/") check.
      if (isSafeRedirect(url)) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        // Compare origins via URL objects (handles port equivalence).
        if (new URL(baseUrl).origin === u.origin) return url;
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
      jti?: string;
      issuedAt?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    provider?: string;
    issuedAt?: number;
    jti?: string;
  }
}
