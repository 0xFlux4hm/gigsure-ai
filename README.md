# GigSure AI

> Work with confidence. Get paid with trust.

GigSure AI is a secure, AI-assisted **project collaboration and payment-coordination platform** for freelancers, clients, and independent professionals. It is **not** a marketplace, a bank, or an escrow provider.

Built for the Nigerian freelance market — designed mobile-first, with explicit honesty about what is implemented, simulated, and unavailable.

---

## What this build includes

**Implemented & working**
- Email/password authentication with scrypt hashing, email verification, password reset
- Google OAuth (real provider wired; simulated demo flow when credentials absent)
- Unified user identity model — one account, multiple auth methods
- Account linking workflow (no auto-merge by email)
- User profile + preferences, privacy controls
- Projects with role-based memberships (OWNER / CLIENT / COLLABORATOR / TEAM_LEAD / REVIEWER)
- Versioned contracts (accepted versions preserved, never overwritten)
- Secure invitations (cryptographically random, hashed, expiring, single-use)
- Tasks with backend-enforced state machine
- Compensation agreements with versioning + per-recipient acceptance
- Milestones with full funding lifecycle (DRAFT → AWAITING_FUNDING → FUNDED → SUBMITTED → APPROVED → RELEASED)
- Mock payment provider with idempotency + HMAC-signed webhooks + replay protection
- Disputes with evidence, messages, reviewer notes — blocks normal milestone release while open
- 7 AI assistants (Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress) via z-ai-web-dev-sdk
- Privacy workflows: data export, account deletion with reauthentication + retention rules
- Audit log of security-relevant actions
- Notifications

**Simulated (clearly labelled in UI)**
- Google OAuth when real credentials are absent
- All payment transactions (mock provider, `isSimulated=true` on every record)

**Unavailable / requires external verification**
- Real Google OAuth (needs valid Google Cloud credentials + redirect URI)
- Real payment provider integration (needs verified provider + CBN/NDPC review + legal sign-off)
- Production email delivery (SMTP)
- Nigerian regulatory compliance approval (see `docs/PRIVACY_AND_COMPLIANCE.md`)

---

## Tech stack

| Layer | Technology |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Prisma + SQLite (swap to PostgreSQL for production) |
| Auth | NextAuth.js v4 (Credentials + Google) |
| UI | Tailwind CSS 4, shadcn/ui (New York), Lucide icons |
| AI | z-ai-web-dev-sdk |
| State | Zustand (client), React Query (server) |

---

## Local development

### Prerequisites

- Node.js 20+ or Bun 1.0+
- A Google Cloud project (optional — only for real Google OAuth)

### Setup

```bash
# 1. Install dependencies
bun install   # or: npm install

# 2. Copy environment template and fill in real values
cp .env.example .env
# Edit .env to set NEXTAUTH_SECRET, NEXTAUTH_URL, etc.

# 3. Push the database schema
bun run db:push

# 4. Start the dev server
bun run dev
# App runs on http://localhost:3000
```

### Other commands

```bash
bun run lint        # ESLint
bun run db:push     # Apply schema changes (destructive)
bun run db:generate # Regenerate Prisma client
bun run db:migrate   # Create & apply a migration
bun run db:reset     # Drop & recreate the database
```

### First run

1. Visit `http://localhost:3000/?view=register`
2. Register with email + password
3. The dev response includes a verification URL — click it
4. Sign in
5. Create your first project from the dashboard

---

## Google OAuth setup (real provider)

If you want real Google sign-in (not the demo flow):

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Configure the OAuth consent screen (External, app name, scopes)
4. Create OAuth client credentials → Web application
5. Add authorized redirect URI: `<your-domain>/api/auth/callback/google`
6. Add test users while in testing mode
7. Set in `.env`:
   ```
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```
8. Restart the server

When `GOOGLE_CLIENT_ID` is empty or starts with `demo_`, the platform falls back to a simulated Google consent screen so you can still exercise the account-linking workflow.

---

## Security highlights

- **scrypt** password hashing (memory-hard, OWASP-recommended)
- Tokens (email verification, password reset, invitation) are 32-byte cryptographic random, stored as SHA-256 hashes, single-use, expiring
- Account-linking requires explicit user action — **no auto-merge by email match**
- All sensitive endpoints enforce: authenticate → load resource → verify membership → check role permission → validate state transition → execute transactionally → audit
- Financial values stored as integer minor units (kobo for NGN) — no binary floating-point arithmetic
- Payment webhooks verified via HMAC-SHA256 + replay protection via `providerEventId`
- Idempotency keys on all funding initiations — duplicate retries return the original record
- AI output is **advisory only** — never auto-saves, never authorizes money movement
- Disputed milestones block normal release flow
- Account deletion: PII anonymized, financial/audit records retained, sessions revoked
- All user input sanitized (XSS, path traversal, mass-assignment defenses)
- Safe error responses (no stack traces leaked to client)

See `docs/THREAT_MODEL.md` and `docs/SECURITY_REQUIREMENTS.md` for the full picture.

---

## Project structure

```
gigsure-ai/
├── prisma/schema.prisma         # All database tables
├── src/
│   ├── app/
│   │   ├── page.tsx             # Single-page app entry (view router)
│   │   ├── layout.tsx           # Root layout
│   │   └── api/                 # All API routes (auth, projects, contracts, etc.)
│   ├── lib/
│   │   ├── db.ts                # Prisma client
│   │   ├── api.ts               # API response helpers
│   │   ├── auth/                # NextAuth config, session, authorization, audit
│   │   ├── security/            # password, tokens, validation
│   │   ├── payments/            # Mock payment provider
│   │   └── nav.ts               # Client-side view router (Zustand)
│   └── views/                   # All UI views (Landing, Auth, Dashboard, Project*, Settings*)
├── docs/                        # Architecture, threat model, API spec, etc.
├── .env.example
└── package.json
```

---

## Known limitations & unresolved risks

See `docs/IMPLEMENTATION_STATUS.md` for the complete list. Highlights:

- **Real payment integration not enabled.** Mock provider only. Real provider requires CBN/NDPC review and legal sign-off.
- **Real Google OAuth requires valid Google Cloud credentials.** Demo flow is simulated.
- **No production email delivery** — verification/reset tokens are surfaced in dev mode only.
- **No automated test suite** in this build. Testing strategy documented in `docs/TESTING_STRATEGY.md`.
- **Nigerian regulatory compliance not verified.** See `docs/PRIVACY_AND_COMPLIANCE.md` for outstanding items.
- **SQLite not suitable for production concurrency.** Migrate to PostgreSQL before any real deployment.

---

## License

Proprietary. All rights reserved.

## Acknowledgements

Built on Next.js, Prisma, NextAuth.js, shadcn/ui, Tailwind CSS, and z-ai-web-dev-sdk.
