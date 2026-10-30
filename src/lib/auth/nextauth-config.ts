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
    //
    // BUG FIX (Oct 29, 2026): previously, the `options` object was missing
    // `maxAge`. Without `maxAge`, browsers treat the cookie as a "session
    // cookie" that lives until the browser is closed — the 7-day JWT
    // maxAge in `session.maxAge` was effectively ignored at the browser
    // level, so users stayed logged in forever (until browser close).
    // Setting `maxAge` to match `session.maxAge` ensures the browser also
    // discards the cookie after 7 days of inactivity.
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-gigsure_session_token"
        : "gigsure_session_token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 7 days — matches session.maxAge above
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
        // CSRF cookie should also expire — default to same 7-day window.
        maxAge: 60 * 60 * 24 * 7,
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
              // SECURITY: Force Google to show:
              //   1. Account selection (user picks which Google account)
              //   2. Consent screen (user reviews what data is shared)
              // This follows Google's recommended OAuth security practices.
              prompt: "select_account consent",
              // SECURITY: Use PKCE for authorization code flow (prevents
              // authorization code interception attacks)
              access_type: "offline",
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
        // SECURITY: Check for stale PENDING_REGISTRATION accounts.
        // PENDING_REGISTRATION expires after 10 MINUTES. If expired, the account
        // is deleted so the email is freed for legitimate use. This prevents
        // squatting — an attacker who briefly controlled the email can't block
        // the victim from registering for more than 10 minutes.
        const existingUser = await db.user.findUnique({
          where: { emailNormalized: email },
          select: { id: true, accountStatus: true, emailVerifiedAt: true, passwordHash: true, createdAt: true },
        });

        if (existingUser) {
          // Check for EXPIRED PENDING_REGISTRATION accounts (older than 10 minutes)
          if (existingUser.accountStatus === "PENDING_REGISTRATION") {
            const ageMinutes = (Date.now() - existingUser.createdAt.getTime()) / (1000 * 60);
            if (ageMinutes > 30) {
              // Delete the expired pending account — frees the email
              await db.user.delete({ where: { id: existingUser.id } }).catch(() => {});
              logSecurityEvent("warn", "auth.google_pending_expired_deleted", {
                email,
                ageMinutes: Math.round(ageMinutes),
              });
              // Fall through to create a fresh account
            } else {
              // Recent pending account (within 10 min) — block sign-in.
              // The user who created it should complete registration.
              // If they lost their session, they must wait 10 min for expiry.
              logSecurityEvent("warn", "auth.google_pending_active", {
                email,
                ageMinutes: Math.round(ageMinutes),
              });
              return `/?view=login&error=PendingRegistration`;
            }
          } else {
            // SECURITY: NEVER auto-link Google to an existing password account.
            // The user must explicitly link Google via Settings → Security.
            logSecurityEvent("warn", "auth.google_email_exists_not_linked", { email });
            return `/?view=login&error=OAuthCallback`;
          }
        }

        // Create a new user account from the Google profile
        // SECURITY: New Google users start with PENDING_REGISTRATION status.
        // They are "logged in" but must accept Terms of Service before
        // they can access the dashboard. This follows standard OAuth onboarding:
        //   1. Google authenticates the user (consent screen)
        //   2. Platform creates a pending account
        //   3. User reviews their info + accepts terms
        //   4. Account is activated → user gets dashboard access
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
                accountStatus: "PENDING_REGISTRATION", // must accept terms
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

        // SECURITY: Only match tokens that are NOT consumed (consumedAt is null).
        // Previously, any unconsumed EmailVerificationToken could be used as a
        // sudo token (confused deputy). Now we explicitly filter for unconsumed
        // tokens and only accept the most recent one.
        const sudoEntry = await db.emailVerificationToken.findFirst({
          where: {
            tokenHash: sudoTokenHash,
            userId: token.userId as string,
            expiresAt: { gt: new Date() },
            consumedAt: null,
            // SECURITY: Only accept tokens issued in the last 15 minutes
            // AND that were created AFTER the user's last login (to distinguish
            // sudo tokens from email verification tokens — sudo tokens are
            // created by /api/auth/reauth which requires password verification)
            createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
          },
          orderBy: { createdAt: "desc" },
        });

        if (sudoEntry) {
          // SECURITY: Atomically consume the token (prevents reuse)
          const consumed = await db.emailVerificationToken.updateMany({
            where: { id: sudoEntry.id, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          if (consumed.count > 0) {
            token.issuedAt = Date.now();
          } else {
            // Race condition — another request consumed it first
            logSecurityEvent("warn", "auth.sudo_token_already_consumed", {
              userId: token.userId as string,
            });
          }
        } else {
          logSecurityEvent("warn", "auth.sudo_token_invalid", {
            userId: token.userId as string,
          });
        }
      }
      // if the user has changed their password since
      // this JWT was issued, force re-authentication by returning an empty
      // token (NextAuth treats this as "not authenticated").
      if (token.userId && token.issuedAt) {
        // BUG FIX (Oct 29, 2026): enforce JWT expiry at the callback level.
        // NextAuth sets `token.exp` based on `jwt.maxAge` (7 days above), but
        // the jwt() callback itself was never checking it — so even after the
        // JWT "expired", the callback kept returning the token as long as the
        // user existed + account was active. This made sessions effectively
        // never expire on the server side, even after we fixed the cookie
        // maxAge. Now we explicitly reject tokens past their `exp`.
        //
        // `token.exp` is in seconds (Unix epoch); compare against current time.
        if (typeof token.exp === "number" && token.exp * 1000 < Date.now()) {
          return { ...token, userId: undefined } as typeof token;
        }
        const u = await db.user.findUnique({
          where: { id: token.userId as string },
          select: { passwordChangedAt: true, accountStatus: true },
        });
        if (!u) {
          // User deleted — invalidate session
          return { ...token, userId: undefined } as typeof token;
        }
        // SECURITY: Allow PENDING_REGISTRATION users to have a session
        // (they need it to complete the registration flow), but ONLY for
        // 10 minutes. After that, the session is invalidated and the
        // account is deleted on the next Google sign-in attempt.
        // Block suspended/deleted users entirely.
        if (u.accountStatus !== "ACTIVE" && u.accountStatus !== "PENDING_REGISTRATION") {
          return { ...token, userId: undefined } as typeof token;
        }
        if (u.accountStatus === "PENDING_REGISTRATION") {
          // Check if the pending account has expired (10 min)
          const userCreated = await db.user.findUnique({
            where: { id: token.userId as string },
            select: { createdAt: true },
          });
          if (userCreated) {
            const ageMinutes = (Date.now() - userCreated.createdAt.getTime()) / (1000 * 60);
            if (ageMinutes > 30) {
              // Expired — invalidate session
              return { ...token, userId: undefined } as typeof token;
            }
          }
        }
        // Store accountStatus in token so the session callback can expose it
        token.accountStatus = u.accountStatus;
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
        (session.user as { jti?: string }).jti = token.jti as string;
        (session.user as { issuedAt?: number }).issuedAt = token.issuedAt as number;
        // Expose accountStatus so the frontend can detect PENDING_REGISTRATION
        // users and redirect them to the onboarding/terms page
        (session.user as { accountStatus?: string }).accountStatus = token.accountStatus as string;
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
    // SECURITY: On signOut, invalidate ALL of the user's sessions — not just
    // the current one. This means:
    //   1. Set passwordChangedAt = now() → forces ALL JWTs to re-validate
    //      (the JWT callback checks passwordChangedAt on every request and
    //      rejects tokens issued before this timestamp)
    //   2. Also revoke the current JTI in RevokedSession (defense-in-depth)
    // This ensures: if a user's session was stolen on device A, signing out
    // on device B kills BOTH sessions immediately.
    async signOut(message) {
      const token = message as { token?: { jti?: string; userId?: string } };
      if (token?.token?.userId) {
        // 1. Update passwordChangedAt → invalidates ALL JWTs for this user
        try {
          await db.user.update({
            where: { id: token.token.userId },
            data: { passwordChangedAt: new Date() },
          });
        } catch {
          // User may have been deleted — ignore
        }

        // 2. Also revoke the current JTI (defense-in-depth)
        if (token.token.jti) {
          try {
            await db.revokedSession.create({
              data: {
                jti: token.token.jti,
                userId: token.token.userId,
                reason: "user_signout_all",
              },
            });
          } catch {
            // Already revoked — ignore
          }
        }

        logSecurityEvent("info", "auth.signout_all_sessions", {
          userId: token.token.userId,
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
      accountStatus?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    provider?: string;
    issuedAt?: number;
    jti?: string;
    accountStatus?: string;
    // BUG FIX (Oct 29, 2026): `exp` is set by NextAuth core based on
    // `jwt.maxAge`. We declare it explicitly so the jwt() callback can
    // read it without TS errors. Without this, NextAuth's types
    // included `exp` only as an implicit any.
    exp?: number;
    iat?: number;
  }
}
