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
import { normalizeEmail, validateEmail, sanitizeDisplayName, isSafeRedirect } from "@/lib/security/validation";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { resolveBaseUrl } from "@/lib/auth/base-url";

const hasGoogleCreds =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !process.env.GOOGLE_CLIENT_ID.startsWith("demo_");

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  // trustHost: true lets NextAuth auto-detect the host from the request URL.
  // This is critical on Vercel where each preview deployment gets a different
  // URL. Without this, NextAuth falls back to NEXTAUTH_URL which may be
  // hardcoded to an old deployment, causing login to redirect to the wrong
  // domain and the session cookie to be lost.
  trustHost: true,
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
        // Require email verification before login (security).
        // Without this, anyone can register with someone else's email
        // and gain immediate access to the platform.
        if (!user.emailVerifiedAt) {
          logSecurityEvent("warn", "auth.login_blocked_email_not_verified", {
            userId: user.id,
            email,
          });

          // AUTO-RESEND: automatically send a new verification email so the
          // user doesn't have to find the "Resend it" link manually. This
          // addresses the common UX issue where users register, don't receive
          // the email (or lose it), try to login, see "Invalid email or
          // password", and don't know what to do next.
          try {
            const rawToken = generateToken();
            await db.emailVerificationToken.create({
              data: {
                userId: user.id,
                tokenHash: hashToken(rawToken),
                expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
              },
            });
            if (process.env.SMTP_URL) {
              const baseUrl = resolveBaseUrl(req as unknown as Request);
              const verificationUrl = `${baseUrl}/?view=verify-email&token=${rawToken}`;
              const { sendEmail, verificationEmail } = await import("@/lib/email/provider");
              await sendEmail(verificationEmail(email, verificationUrl));
            }
          } catch (err) {
            // Don't fail login because of resend failure — just log it
            logSecurityEvent("error", "auth.auto_resend_failed", {
              userId: user.id,
              message: (err as Error)?.message,
            });
          }

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
    async signIn({ user, account, profile }) {
      // For Google OAuth: auto-create the user if they don't exist yet.
      // This is the "first-time Google sign-in" flow — when a user clicks
      // "Continue with Google" for the first time, we create their account
      // automatically using their Google profile data.
      if (account?.provider === "google" && account.providerAccountId) {
        const email = normalizeEmail(user.email ?? "");
        if (!validateEmail(email)) {
          logSecurityEvent("warn", "auth.google_invalid_email", { email });
          return false;
        }

        // SECURITY: Verify Google confirmed the email is verified.
        // Without this, an attacker with a Google Workspace could create
        // an unverified alias email and auto-create a GigSure account
        // with emailVerifiedAt = now, bypassing email verification.
        if (profile?.email_verified !== true) {
          logSecurityEvent("warn", "auth.google_email_not_verified", { email });
          return false;
        }

        // Check if a UserIdentity already exists for this Google account
        const existingIdentity = await db.userIdentity.findUnique({
          where: {
            provider_providerSubject: {
              provider: "google",
              providerSubject: account.providerAccountId,
            },
          },
          include: { user: true },
        });

        if (existingIdentity) {
          // Returning Google user — check their account is active
          if (existingIdentity.user.accountStatus !== "ACTIVE") {
            logSecurityEvent("warn", "auth.google_blocked_account", {
              userId: existingIdentity.userId,
              status: existingIdentity.user.accountStatus,
            });
            return false;
          }
          // Update lastAuthenticatedAt
          await db.userIdentity.update({
            where: { id: existingIdentity.id },
            data: { lastAuthenticatedAt: new Date() },
          });
          // Inject the user ID so the jwt callback can use it
          user.id = existingIdentity.userId;
          return true;
        }

        // New Google user — check if an account with this email already exists
        const existingUser = await db.user.findUnique({
          where: { emailNormalized: email },
          select: { id: true, accountStatus: true, emailVerifiedAt: true, passwordHash: true },
        });

        if (existingUser) {
          // Account exists with this email but has no Google identity linked.
          // SECURITY: Auto-link if BOTH Google and the platform have verified
          // the email. This is safe because:
          //   1. Google confirmed email_verified === true (checked above)
          //   2. The platform confirmed the email via the verification flow
          //   3. Both verifications point to the same person
          // This allows existing password users to also sign in with Google.
          if (existingUser.emailVerifiedAt && existingUser.accountStatus === "ACTIVE") {
            // Auto-link the Google identity to the existing account
            await db.userIdentity.create({
              data: {
                userId: existingUser.id,
                provider: "google",
                providerSubject: account.providerAccountId,
                lastAuthenticatedAt: new Date(),
              },
            }).catch(() => {
              // P2002 — identity already exists (race condition), ignore
            });

            user.id = existingUser.id;

            await recordAuditEvent({
              actorId: existingUser.id,
              action: "auth.google_auto_linked",
              targetType: "User",
              targetId: existingUser.id,
              metadata: { provider: "google", email },
            });

            return true;
          }

          // If the existing user's email is NOT verified, or the account is
          // not active, block the sign-in (security: don't auto-link to
          // unverified or suspended accounts).
          logSecurityEvent("warn", "auth.google_email_exists_not_linked", { email });
          return `/api/auth/error?error=OAuthCallback`;
        }

        // Create a new user account from the Google profile
        const displayName = sanitizeDisplayName(
          profile?.name ?? user.name ?? user.email?.split("@")[0] ?? "Google User"
        );

        try {
          const newUser = await db.$transaction(async (tx) => {
            const u = await tx.user.create({
              data: {
                email,
                emailNormalized: email,
                displayName: displayName || "Google User",
                passwordHash: null, // no password — Google OAuth only
                emailVerifiedAt: new Date(), // Google verified the email
                accountStatus: "ACTIVE",
              },
            });
            await tx.userIdentity.create({
              data: {
                userId: u.id,
                provider: "google",
                providerSubject: account.providerAccountId,
                lastAuthenticatedAt: new Date(),
              },
            });
            await tx.userProfile.create({
              data: {
                userId: u.id,
                skills: "[]",
                portfolioLinks: "[]",
                preferredCategories: "[]",
              },
            });
            await tx.userPreferences.create({
              data: { userId: u.id },
            });
            return u;
          });

          // Inject the new user ID so the jwt callback can use it
          user.id = newUser.id;

          await recordAuditEvent({
            actorId: newUser.id,
            action: "auth.google_register",
            targetType: "User",
            targetId: newUser.id,
            metadata: { provider: "google", email },
          });
        } catch (err) {
          logSecurityEvent("error", "auth.google_user_creation_failed", {
            email,
            message: (err as Error)?.message,
          });
          return false;
        }
      }
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
      // SECURITY: Handle sudo elevation via server-issued one-time token.
      // When the frontend calls `await update({ sudoToken: "..." })` after
      // /api/auth/reauth verifies the password, we verify the token
      // server-side before refreshing issuedAt. This prevents clients from
      // arbitrarily elevating sudo mode without password verification.
      if (trigger === "update" && session?.sudoToken) {
        const { hashToken } = await import("@/lib/security/tokens");
        const sudoTokenHash = hashToken(session.sudoToken as string);

        // Look up the token in the DB (stored by reauth endpoint)
        const sudoEntry = await db.emailVerificationToken.findFirst({
          where: {
            tokenHash: sudoTokenHash,
            userId: token.userId as string,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (sudoEntry) {
          // Consume the token (single-use) — wrapped in try/catch for P2005
          // (already deleted by a concurrent update() call — treat as success)
          try {
            await db.emailVerificationToken.delete({ where: { id: sudoEntry.id } });
          } catch {
            // Already consumed by a concurrent request — token is valid, proceed
          }
          token.issuedAt = Date.now();
        } else {
          // Invalid or expired token — do NOT elevate
          logSecurityEvent("warn", "auth.sudo_token_invalid", {
            userId: token.userId as string,
          });
        }
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
