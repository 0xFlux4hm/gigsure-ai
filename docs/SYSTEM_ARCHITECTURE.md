# GigSure AI — System Architecture

## Overview

GigSure AI is a **modular monolith** built on Next.js 16 (App Router). All API routes live within the Next.js process. The frontend is a single-page application rendered at `/` with client-side view routing (Zustand) — this keeps the deployment model simple (one process, one port) while supporting a multi-view UX.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (client)                    │
│  - React 19 + Tailwind + shadcn/ui                      │
│  - Zustand view router (URL ↔ state sync)              │
│  - React Query / fetch for API calls                    │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS (cookies + JSON)
┌──────────────────────────┴──────────────────────────────┐
│              Next.js 16 (single process)                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  /                  → single-page app shell         │ │
│  │  /api/auth/*        → NextAuth handlers             │ │
│  │  /api/auth/register → email/password registration   │ │
│  │  /api/auth/verify-email, forgot-password, etc.      │ │
│  │  /api/me, /api/profile, /api/settings              │ │
│  │  /api/projects, /api/projects/[id]/*                │ │
│  │  /api/payments/webhook → mock provider receiver     │ │
│  │  /api/ai/assistant → z-ai-web-dev-sdk              │ │
│  │  /api/privacy/{export,delete}                     │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  src/lib/                                           │ │
│  │    auth/  → NextAuth config, sessions, authz, audit │ │
│  │    security/ → password, tokens, validation         │ │
│  │    payments/ → mock provider + webhook processing   │ │
│  │    db.ts → Prisma client                            │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ Prisma
┌──────────────────────────┴──────────────────────────────┐
│                  SQLite (dev) / PostgreSQL (prod)       │
│  30+ tables: users, identities, sessions, projects,    │
│  contracts, tasks, milestones, funding, disputes,      │
│  audit, AI activity, privacy requests, etc.            │
└─────────────────────────────────────────────────────────┘

External integrations:
- Google OIDC (for OAuth sign-in; optional via env)
- z-ai-web-dev-sdk (for AI assistants)
- Mock payment provider (in-process simulated webhook delivery)
```

## Why a single-page app at `/`?

The hosting environment restricts externally-visible routes to `/`. We use a Zustand-based view router that mirrors view state to the `?view=` query parameter, supporting:
- Back/forward navigation (popstate handler)
- Shareable links (e.g. `/?view=invitation&token=…`)
- Auth-gated routing (only authenticated users see `dashboard`, `projects`, etc.)

All other routes (`/api/*`) remain server-side and are not visible in the preview pane.

## Trust boundary

The browser is **untrusted**. Every API route enforces:
1. Authentication (NextAuth JWT → userId)
2. Resource loading (with membership check)
3. Role-based permission check (`hasPermission(role, perm)`)
4. State-transition validation (e.g. only `SUBMITTED → APPROVED` allowed)
5. Atomic transaction (e.g. invitation acceptance + membership creation)
6. Audit event recording

The frontend is presentation only — never the source of truth for authorization.

## Data flow (funding example)

```
1. User clicks "Initiate funding" in /project-milestones
2. Browser POSTs to /api/projects/[id]/funding with {type, milestoneId, amountMinor}
3. API verifies user is OWNER + milestone is DRAFT/AWAITING_FUNDING
4. API calls initiateFunding() in lib/payments/mock-provider.ts
   - Generates providerTxRef + idempotencyKey
   - Creates FundingRecord (status=INITIATED, isSimulated=true)
   - Records audit event
   - Schedules async mock webhook delivery (400ms)
5. Mock provider POSTs to /api/payments/webhook with HMAC signature
6. Webhook handler verifies signature, checks providerEventId for replay,
   updates FundingRecord to PROVIDER_CONFIRMED + advances milestone to FUNDED
7. UI polls / refreshes to show confirmed status
```

## Concurrency model

SQLite has limited concurrent write capacity — acceptable for local dev. Production should use PostgreSQL, which supports row-level locking. Critical operations (invitation accept, contract accept, milestone approve) use Prisma transactions to ensure atomicity.

## Failures & fallbacks

- AI provider down → deterministic fallback response per assistant type
- Webhook delivery fails → webhook is logged but funding record stays in INITIATED; manual reconciliation path documented
- Database write fails → request fails with 500; no partial state committed (transactional)

## Future architectural evolution

- Move to PostgreSQL when load or concurrency demands
- Extract webhook processor into a queue (BullMQ / SQS) when scaling
- Add Redis for distributed rate-limit counters (currently in-memory)
- Add object storage (S3-compatible) for evidence/deliverable files
- Split AI provider calls into a separate worker process
