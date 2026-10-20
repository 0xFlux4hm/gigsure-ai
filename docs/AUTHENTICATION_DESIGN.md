# GigSure AI — Authentication Design

## Overview

Two providers, one unified identity model:

1. **Email + password** (Credentials provider) — scrypt hashing
2. **Google OAuth** (real provider, requires valid Google Cloud credentials)

If `GOOGLE_CLIENT_ID` is absent or starts with `demo_`, the app falls back to a simulated Google flow (`google-demo` provider) so the OAuth UX and account-linking workflow can be exercised without real credentials.

## Why unified identity

Spec section 7.6 requires: "Do not create a separate user account for every login method."

Implementation:
```
User (1) ──── (N) UserIdentity
                  - provider: "password" | "google" | "github" | ...
                  - providerSubject: OIDC sub (Google) or normalized email (password)
                  - UNIQUE (provider, providerSubject)
```

A user registers with email/password → `User` row + `UserIdentity(provider="password", providerSubject=email)`.
Later links Google → new `UserIdentity(provider="google", providerSubject=<oidc-sub>)` added to the same `User`.

## Registration flow (email/password)

```
Browser → POST /api/auth/register { email, displayName, password, termsAccepted }

1. Validate input (Zod): email format, displayName length, password policy, termsAccepted=true
2. Normalize email (lowercase + trim)
3. Check duplicate User by emailNormalized (return same response shape regardless — enumeration defense)
4. Hash password with scrypt (N=16384, r=8, p=1, 64-byte hash)
5. Transactional:
   - INSERT User (accountStatus=ACTIVE, emailVerifiedAt=null)
   - INSERT UserIdentity (provider="password")
   - INSERT UserProfile (defaults)
   - INSERT UserPreferences (defaults)
   - INSERT EmailVerificationToken (tokenHash = SHA-256(random 32B), 24h expiry)
6. Audit event: auth.register
7. In dev: return raw token + verificationUrl in response
   In prod: email the verification link via SMTP provider
8. Browser auto-signs-in via NextAuth credentials provider
```

## Login flow (email/password)

```
Browser → POST /api/auth/callback/credentials { email, password }

1. Normalize email
2. Lookup User by emailNormalized
3. Always call verifyPassword (even if user not found — uses dummy hash) to prevent timing-based enumeration
4. If user found + password matches + accountStatus=ACTIVE:
   - Update lastLoginAt
   - Issue JWT session via NextAuth
   - Audit event: auth.login_success
5. Else:
   - Log security event: auth.login_failed
   - Return generic "Invalid email or password" (no enumeration)
```

## Google OAuth flow (real)

```
1. Browser → GET /api/auth/signin/google
2. NextAuth generates random state, redirects to:
   https://accounts.google.com/o/oauth2/v2/auth?
     response_type=code&client_id=...&redirect_uri=...&scope=openid email profile&
     state=<random>&code_challenge=...&code_challenge_method=S256
3. User consents on Google → redirect to /api/auth/callback/google?code=...&state=...
4. NextAuth verifies state (cookie match), exchanges code for tokens
5. NextAuth verifies ID token signature against Google JWKS
6. NextAuth validates issuer, audience, expiration
7. Extracts `sub` (Google's stable user ID) + email + email_verified claim
8. Calls our adapter:
   - Lookup UserIdentity by (provider="google", providerSubject=sub)
   - If exists: issue session for that User
   - If not exists: create new User + UserIdentity (auto-provisioning for first-time Google users)
9. Audit event: auth.google_login
```

## Demo Google flow (when no real creds)

```
1. Browser → GET /api/auth/google-demo/start
   - Server generates random state (16B), sets cookie `gigsure_oauth_state = SHA-256(state)`
   - Redirects to /?view=google-demo-consent&state=<state>
2. User enters email + name on simulated consent screen
3. Browser → POST /api/auth/google-demo/callback?state=<state>
   { consentEmail, consentName }
   - Server verifies state cookie matches SHA-256(state)
   - Issues synthetic OIDC code, stores in issuedCodes Map
4. Browser → POST /api/auth/callback/google-demo { code }
   - NextAuth exchanges code via /api/auth/google-demo/callback (GET in our case)
   - Fetches userinfo via /api/auth/google-demo/userinfo
   - Uses sub + email to create/lookup User (same as real Google flow)
```

## Account-linking flow (already-authenticated user)

```
User is signed in (session.userId = X) → wants to link Google identity

1. User clicks "Link Google" in /settings/security
2. Browser → initiates Google OAuth flow (real or demo)
3. After OAuth completes, server has Google `sub` + email
4. Browser → POST /api/auth/link-google { googleSub, email }
5. Server:
   - Verify user is signed in (requireUserId)
   - Check UserIdentity where (provider="google", providerSubject=googleSub)
     - If exists and userId !== current: 409 "Identity already linked to another account"
     - If exists and userId === current: 200 "Already linked"
     - If not exists:
       - Transactional INSERT UserIdentity + LinkedAccount
       - Audit event: auth.identity_linked
6. Browser refreshes /settings/security to show new linked identity
```

**Critical**: Never auto-merge accounts based on email match. If a Google identity returns an email that matches an existing GigSure user's email, but no UserIdentity exists for that Google sub, the user must sign in to their existing GigSure account first and then explicitly link the Google identity.

## Unlink flow

```
User clicks "Unlink Google" in /settings/security

1. Browser → POST /api/auth/unlink-google { provider, providerSubject }
2. Server:
   - Verify user is signed in
   - Count UserIdentity records for this user
   - If count <= 1: 400 "Must keep at least one authentication method"
   - Else: DELETE UserIdentity + LinkedAccount rows
   - Audit event: auth.identity_unlinked
```

## Email verification flow

```
1. After registration, EmailVerificationToken created (hash stored, 24h expiry)
2. In dev: verificationUrl returned in API response
   In prod: email sent with link `/?view=verify-email&token=<raw>`
3. User clicks link → /?view=verify-email&token=<raw>
4. Browser → POST /api/auth/verify-email { token }
   - Hash token, lookup EmailVerificationToken
   - If not found: 400 "Invalid or expired token"
   - If consumedAt not null: 400 "Token already used"
   - If expiresAt < now: 400 "Token expired"
   - Else: transactional consume token + set User.emailVerifiedAt = now
   - Audit event: auth.email_verified
5. Browser redirects to /?view=login
```

## Password reset flow

```
1. Browser → POST /api/auth/forgot-password { email }
   - Normalize email
   - Rate-limit per email (3 per 10 min)
   - Lookup User; if found:
     - Generate token (32B random), hash, store with 1h expiry
     - In dev: log raw token; in prod: email link `/?view=reset-password&token=<raw>`
   - If not found: log security event (no enumeration in response)
   - Return same response: "If the email is registered, a reset link has been sent."

2. User clicks link → /?view=reset-password&token=<raw>

3. Browser → POST /api/auth/reset-password { token, newPassword }
   - Hash token, lookup PasswordResetToken
   - If not found / consumed / expired: 400
   - Validate new password policy
   - Hash new password with scrypt
   - Transactional:
     - Mark token consumedAt
     - Update User.passwordHash
     - Update User.lastLoginAt
   - Create notification "Password changed"
   - Audit event: auth.password_reset_completed
4. Browser redirects to /?view=login (user must re-authenticate)
```

## Session management

- **Strategy**: JWT (NextAuth default, stateless)
- **Lifetime**: 7 days max, refreshed hourly
- **Storage**: `gigsure_session_token` cookie (HttpOnly, SameSite=lax, Secure in prod)
- **CSRF**: `gigsure_csrf_token` cookie (double-submit pattern, validated by NextAuth on state-changing requests)
- **Invalidation**:
  - On password change: user must re-authenticate
  - On password reset: previous session remains valid until JWT expires (TODO: token revocation list)
  - On account deletion: all session cookies cleared via `Session` table deleteMany

## What is NOT done

- Real Google OAuth requires valid credentials + verified redirect URI.
- Real SMTP email delivery (verification/reset links surface in dev response only).
- Session revocation list (after password change, old JWTs remain valid until expiry).
- Per-IP rate limiting on login endpoint (only per-email on reset/resend).
- WebAuthn / passkey support (future enhancement).
