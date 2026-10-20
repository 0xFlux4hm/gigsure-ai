# GigSure AI — Security Requirements Checklist

Mapping to OWASP ASVS v4.0 categories where applicable.

## Authentication (ASVS V2)

- [x] Password hashing uses scrypt (memory-hard KDF) with random salt
- [x] Password policy: 8–128 chars, requires letter + digit
- [x] Login throttling per email on forgot-password / resend-verification (3 req / 10 min)
- [ ] Login throttling per IP/email on actual login (TODO)
- [x] Account enumeration prevention: same response shape regardless of email existence
- [x] Email verification before sensitive operations
- [x] Password reset: single-use, hashed, 1h expiry, notification after change
- [x] Forgot-password: same response whether email exists or not

## Session management (ASVS V3)

- [x] JWT-based sessions (NextAuth default)
- [x] Session regeneration on login (JWT re-issued)
- [x] HttpOnly + Secure (prod) + SameSite=lax cookies
- [x] Session invalidation on password reset (user must re-authenticate)
- [x] Logout endpoint available via NextAuth
- [ ] CSRF token validation on state-changing endpoints (TODO — NextAuth has built-in CSRF, but custom routes need explicit double-submit cookie)

## Access control (ASVS V4)

- [x] Server-side authorization on every protected endpoint
- [x] Resource-level authorization (IDOR prevention): every `/api/projects/[id]/*` checks membership
- [x] Role-based permissions enforced via `assertPermission(membership, permission)`
- [x] State-machine enforcement for task/milestone/contract transitions
- [x] Reviewer can access only disputes assigned to them
- [x] AI endpoints check membership before retrieving project data
- [x] Compensation: user can accept only their own allocation
- [x] Account-linking: refuses to link identity already owned by another user
- [x] Last-auth-method removal blocked

## Input validation & output encoding (ASVS V5)

- [x] All API inputs validated with Zod schemas
- [x] Email normalization (lowercase + trim)
- [x] Display name sanitization (control chars stripped, length capped)
- [x] Currency codes validated against allowlist
- [x] Amount parsing: integer minor units, no float arithmetic for authoritative values
- [x] Safe basename for file uploads (no path traversal)
- [x] MIME allowlist for uploads
- [x] 10 MiB upload size limit
- [x] Safe redirect: only same-origin or relative paths

## Cryptography (ASVS V6)

- [x] scrypt for password hashing (N=16384, r=8, p=1)
- [x] SHA-256 for token hashing (verification, reset, invitation)
- [x] 32-byte cryptographic random for all tokens
- [x] HMAC-SHA256 for webhook signatures
- [x] No custom crypto

## Error handling & logging (ASVS V7, V8)

- [x] Stack traces never leaked to client (apiRoute wrapper)
- [x] Generic error messages for sensitive operations
- [x] Structured JSON logs for security events
- [x] Audit log records every security-relevant action with metadata
- [x] Tokens / passwords / session secrets NEVER logged
- [x] Audit events include actor, target, action, metadata, IP, timestamp

## Data protection (ASVS V8)

- [x] PII minimization (only essential fields collected)
- [x] Account deletion: PII anonymized, financial/audit records retained
- [x] Data export: excludes other users' private data
- [x] Profile visibility settings (PRIVATE / TEAM / PUBLIC)

## Communication security (ASVS V9)

- [x] HTTPS enforced in production via cookie `Secure` flag
- [x] SameSite=lax on all cookies
- [ ] HSTS header (TODO — add via Next.js middleware or reverse proxy)
- [ ] CSP header (TODO)

## File handling

- [x] Filename sanitization (path traversal prevention)
- [x] MIME type allowlist
- [x] Size limit (10 MiB)
- [x] Private storage (storageKey abstraction — never publicly accessible)
- [ ] Malware scanning (TODO — integrate ClamAV or cloud scanning)

## Business logic

- [x] Funding record status distinct from milestone status (no single "paid" boolean)
- [x] Funding records clearly labelled `isSimulated=true`
- [x] Idempotency keys on funding initiation (duplicate retries return original record)
- [x] Webhook signature verification + replay protection
- [x] Disputed milestones block normal release flow
- [x] AI output is advisory; never auto-saves; never authorizes financial operations
- [x] Contract versioning: accepted versions preserved, never overwritten
- [x] Compensation: sum of allocations must match total distributable (when enforced)
- [x] Compensation: per-recipient acceptance only
- [x] Concurrent-safe invitation acceptance (transactional)
- [x] Concurrent-safe contract acceptance (transactional)

## Infrastructure

- [x] No hardcoded secrets (all via env vars)
- [x] `.env.example` documents all required vars
- [x] Production cookies require HTTPS
- [x] No debug mode in production
- [ ] CI workflow (TODO — script exists, CI not yet configured)
- [ ] Dependency vulnerability scanning (TODO — `bun audit` to be added to CI)
- [ ] Secret scanning (TODO — pre-commit hook to be added)

## Compliance research

- [x] Nigeria Data Protection Act (NDPA) awareness documented
- [x] NDPC guidance referenced
- [x] CBN requirements flagged for payment integration
- [ ] Verified legal sign-off (requires qualified Nigerian counsel)

## What is explicitly NOT done

- Real Google OAuth (needs valid credentials)
- Real payment provider (needs verified provider + regulatory review)
- Production email delivery (SMTP)
- Automated test suite (strategy documented in TESTING_STRATEGY.md)
- Production deployment (not authorized)
