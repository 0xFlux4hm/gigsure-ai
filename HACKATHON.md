# GigSure AI — PayPal AI Hackathon Submission

> **Track:** Open (no prescribed tracks)
> **Prize targets:** Best Use of PayPal + AI, Best Use of Agentic Commerce, Most Impactful
> **Builder:** Ahmad Muhammad Wammi (0xFlux4hm) — Lagos, Nigeria 🇳🇬
> **Build period:** October 30 — November 12, 2026
> **Submission deadline:** Wed Nov 12, 2026, 9 PM ET (Thu Nov 13, 2 AM WAT)
> **Live app:** https://gigsure-ai.vercel.app/
> **GitHub:** https://github.com/0xFlux4hm/gigsure-ai

---

## The Problem

Africa's independent services market — developers, designers, writers, consultants — is invisible to the global gig economy. **Upwork doesn't serve Nigeria.** Stripe doesn't process NGN payouts. Western freelancers get paid in USD; African professionals get paid in nothing.

When they DO find international clients, the problems multiply:

- **Unclear requirements** → scope creep → disputes
- **No escrow** → unpaid completed work
- **No cross-border payment** → international clients can't pay in their currency
- **No contract protection** → freelancers bear all the risk
- **No transparency** → he-said-she-said disputes with no records

**GigSure AI solves this.** We're building for **Africa**, starting with **Nigeria**.

---

## What GigSure AI Is

GigSure AI is an AI-powered project contract and payment transparency platform connecting international clients with skilled African professionals.

It is **NOT a freelance marketplace.** It's a trust layer — contract versioning, milestone-based escrow, AI-assisted contract analysis, and neutral dispute documentation. Clients bring their own freelancers; GigSure ensures everyone gets paid fairly.

### Three funding arrangements supported:

1. **Full funding** — single milestone, one payment
2. **Milestone-based** — split across deliverables
3. **Upfront + milestones** — initial payment + milestone-based remainder

---

## Hackathon scope (Oct 30 – Nov 12 — what we demo)

Per hackathon rules: *"Entrants must build or update an application that integrates the PayPal developer platform along with an AI tool, model, or platform of their choice."*

### Two technologies, deeply integrated:

#### 1. PayPal — Cross-Border Escrow

International clients fund milestones in **USD via PayPal**. The Nigerian professional receives **NGN via Monnify/OPay**. GigSure's escrow holds the funds until milestones are met.

| PayPal API / capability | Where it's used |
|---|---|
| **Orders API v2** (`POST /v2/checkout/orders`) | Creating cross-border USD payment orders for NGN milestones |
| **OAuth 2.0 token endpoint** (`POST /v1/oauth2/token`) | Server-to-server authentication with PayPal |
| **Webhook verification API** (`POST /v1/notifications/verify-webhook-signature`) | Robust signature verification using PayPal's official API |
| **Refunds API** (`POST /v2/payments/captures/{id}/refund`) | Processing milestone refunds through PayPal |
| **Sandbox environment** | All testing uses developer.paypal.com sandbox — no real money moves |

#### 2. Groq AI — 5 Production AI Features

Running on **Groq's LPU hardware** at **500+ tokens/sec** with `openai/gpt-oss-20b`. Free tier: 30 RPM / 1,000 RPD, no credit card required.

| AI Feature | What it does | API Endpoint |
|---|---|---|
| **AI Project Brief Generator** | Customer describes project in plain language → AI generates structured brief (title, scope, deliverables, skills, timeline, clarifying questions). Editable before saving. | `POST /api/ai/project-brief` |
| **AI Milestone Generator** | Analyzes project scope + funding arrangement → suggests milestone breakdown with deliverables, acceptance criteria, dependencies, payment percentages. Never invents amounts — only percentages. | `POST /api/ai/milestones` |
| **AI Contract Analysis** | Clause-by-clause contract review. 8 risk categories: missing info, ambiguous obligations, unclear deliverables, missing acceptance criteria, unspecified deadlines, payment inconsistencies, conflicting clauses, completion conditions. | `POST /api/ai/contract-analysis` |
| **AI Project Assistant** (10 assistants) | Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress + 3 new: Project Brief Helper, Milestone Helper, Dispute Helper. Advisory only — never makes financial decisions. | `POST /api/ai/assistant` |
| **AI Dispute Summary** | Neutral summary of dispute using authorized records. Timeline, agreed vs. submitted deliverables, gaps, key claims from both parties, clarifying questions, recommended next steps (administrative only — NEVER financial). | `POST /api/ai/dispute-summary` |

### AI safety guardrails

- **Advisory only** — AI never authorizes payments, releases funds, freezes accounts, or makes binding decisions
- **Prompt injection defense** — sanitizes all user input (strips JWTs, emails, phones, BVN/NIN, cards, IBANs, zero-width chars, instruction injection patterns)
- **Disclosure resistance** — system prompts include anti-reveal clauses
- **Response post-filtering** — filters injection compliance markers from AI output
- **Structured output validation** — JSON responses validated against TypeScript schemas before use
- **Per-user rate limiting** — 20 AI calls/hour per user, 30/hour per IP

---

## Architecture

### Cross-border payment flow (the demo centerpiece)

```
┌────────────────┐      USD        ┌──────────────┐
│  International │ ── PayPal ────► │   PayPal     │
│  Client (US)   │    Checkout     │   Sandbox    │
└────────────────┘                  └──────┬───────┘
                                          │ webhook
                                          ▼
                              ┌────────────────────┐
                              │  GigSure webhook   │
                              │  /api/payments/    │
                              │  webhook/paypal    │
                              └─────────┬──────────┘
                                        │ confirm
                                        ▼
                              ┌────────────────────┐    NGN     ┌────────────┐
                              │  GigSure escrow    │ ─────────► │ Freelancer │
                              │  (FundingRecord)   │  Monnify   │ bank acct  │
                              └────────────────────┘   /OPay   └────────────┘
```

1. International client clicks "Pay with PayPal" on a NGN-denominated milestone
2. GigSure converts NGN → USD at the platform demo rate (1 USD = ₦1,500)
3. Server creates a PayPal Order via `POST /v2/checkout/orders`
4. PayPal returns an approval URL → client opens PayPal sandbox checkout
5. Client approves the USD payment in PayPal
6. PayPal webhook fires at `/api/payments/webhook/paypal` (`PAYMENT.CAPTURE.COMPLETED`)
7. Server verifies the webhook via PayPal's official `verify-webhook-signature` API
8. Funds are recorded in the FundingRecord (in NGN, converted back from USD)
9. Escrow holds the funds
10. On milestone completion, Monnify/OPay pays out to the freelancer's bank account in NGN

### AI architecture

```
┌──────────────┐     prompt      ┌───────────────┐
│  GigSure UI  │ ──────────────► │  Groq LPU     │
│  (React)     │                 │  openai/      │
│              │ ◄────────────── │  gpt-oss-20b  │
└──────────────┘   500 tok/s     └───────────────┘
       │
       │ structured JSON
       ▼
┌──────────────┐
│  Parsed +    │
│  validated   │
│  report      │
└──────────────┘
```

- AI calls go through a **unified provider abstraction** (`src/lib/ai/ai-provider.ts`) that supports 5 backends: Groq, Z.AI, Gemini, DeepSeek, AgentRouter. Currently active: **Groq**.
- All AI responses are rendered as **dashboard-style reports** with stat cards, severity badges, styled tables, and recommendations sections — not raw chatbot text.
- 5-minute in-memory response cache deduplicates identical AI calls (extends effective free-tier quota 5-10×).

### Webhook security

PayPal webhook verification uses the **official API** at `POST /v1/notifications/verify-webhook-signature` (not the older CRC32-based scheme). This is more robust because:

- PayPal handles the cryptographic verification server-side
- Works with any webhook event type
- Doesn't require manual certificate fetching + signature computation

The verification call sends PayPal's transmission headers (`paypal-transmission-id`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-time`) plus the webhook ID + the raw event body. PayPal responds with `verification_status: "SUCCESS"` or `"FAILURE"`.

If `PAYPAL_WEBHOOK_ID` is not configured, the verifier fails safe (returns `valid: false`) — no unverified webhook is ever processed.

---

## New files (hackathon work)

| File | Purpose |
|---|---|
| `src/lib/payments/paypal-provider.ts` (~430 lines) | PayPal provider adapter — OAuth, Orders API v2, Capture, Refunds, Webhook verification, health check. Cross-border USD→NGN conversion. |
| `src/lib/ai/ai-provider.ts` (~290 lines) | Unified OpenAI-compatible provider abstraction supporting 5 backends (Groq, Z.AI, Gemini, DeepSeek, AgentRouter) |
| `src/lib/ai/groq.ts` (~200 lines) | Reusable AI service module — `callAI()`, `extractJson()`, 4 feature functions |
| `src/lib/ai/prompts.ts` (~200 lines) | 5 system prompts with TypeScript interfaces + disclosure-resistance suffix |
| `src/lib/security/sanitize-ai.ts` (~100 lines) | Shared PII sanitization + prompt injection defense (extracted from assistant route) |
| `src/components/ai/AiMarkdown.tsx` (~200 lines) | Professional Markdown renderer with severity badges, styled tables, report header |
| `src/components/ai/AiReportRenderer.tsx` (~300 lines) | Dashboard-style report renderer — parses AI markdown into stat cards + table + recommendations |
| `src/components/ai/AiFeaturePanels.tsx` (~700 lines) | 4 reusable UI components: ProjectBriefGenerator, MilestoneGenerator, ContractAnalysisPanel, DisputeSummaryPanel |
| `src/components/contracts/NewContractForm.tsx` (~800 lines) | Multi-step contract form: Edit → Review → Submit, autosave, AI assist, version diff |
| `src/app/api/ai/project-brief/route.ts` | NEW API route — AI Project Brief Generator |
| `src/app/api/ai/milestones/route.ts` | NEW API route — AI Milestone Generator |
| `src/app/api/ai/contract-analysis/route.ts` | NEW API route — Enhanced contract analysis (8 risk categories, supersedes contract-risk) |
| `src/app/api/ai/dispute-summary/route.ts` | NEW API route — AI Dispute Summary (neutral, never decides) |
| `src/components/shared/AccountSetupCard.tsx` (~200 lines) | Premium onboarding checklist card (KYC + bank account) with progress bar |

### Modified files

| File | Change |
|---|---|
| `src/app/api/ai/assistant/route.ts` | Added 3 new assistants (Project Brief Helper, Milestone Helper, Dispute Helper) + research-grade report format prompts + cache + retry logic |
| `src/lib/payments/registry.ts` | Registered PayPalProvider alongside Monnify + OPay |
| `src/app/api/payments/initiate/route.ts` | Added `paypal` to provider schema |
| `src/app/api/payments/webhook/[provider]/route.ts` | Added PayPal webhook handling |
| `src/views/ProjectFundingView.tsx` | Added PayPalFundingCard component |
| `src/views/ProjectAiView.tsx` | Upgraded to dashboard report renderer + 3 new assistants |
| `src/views/ProjectContractsView.tsx` | Replaced Dialog with multi-step Sheet form |
| `src/views/ProjectMilestonesView.tsx` | Added AI Milestone Generator button + Sheet |
| `src/views/ProjectDisputeDetailView.tsx` | Added AI Dispute Summary panel |
| `src/views/DashboardView.tsx` | Replaced alerts with AccountSetupCard, fixed stat card colors |
| `src/views/AuthViews.tsx` | Removed unprofessional footer badges |
| `src/views/ProjectsView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectTasksView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectDisputesView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectExpensesView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectTeamView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectCompensationView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/ProjectFeedbackView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/SettingsPayoutsView.tsx` | Converted Dialog → responsive Sheet |
| `src/views/SettingsSecurityView.tsx` | Converted Dialog → responsive Sheet |
| `src/app/globals.css` | Added premium CSS classes for checklist, report styling |
| `src/views/ProjectsView.tsx` | Inline validation for project creation (min 3 chars title, min 10 chars description) |
| `src/views/ProjectMilestonesView.tsx` | Inline validation for milestone creation (amount > 0, title min 2 chars) |

---

## Environment variables

### Vercel (production demo)

```
DATABASE_URL=<your-postgres-url>
NEXTAUTH_SECRET=<32+ char random string>
NEXTAUTH_URL=<your-vercel-domain>

# PayPal (PayPal AI Hackathon — sandbox only)
PAYPAL_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=<from developer.paypal.com>
PAYPAL_CLIENT_SECRET=<from developer.paypal.com>
PAYPAL_WEBHOOK_ID=<from developer.paypal.com>

# AI (Groq — free tier, 500+ tok/s LPU)
AI_PROVIDER=groq
GROQ_API_KEY=<from console.groq.com/keys>

# Google OAuth (optional)
GOOGLE_CLIENT_ID=<if-enabled>
GOOGLE_CLIENT_SECRET=<if-enabled>

# Email (optional)
SMTP_URL=<if-enabled>
```

---

## Demo script (3-minute video)

| Time | Demo beat | Tech shown |
|---|---|---|
| 0:00 – 0:20 | **"Why this, why now"** — Ahmad introduces himself (Lagos-based, cybersecurity bug hunter). The problem: Africa's independent professionals are invisible to the global gig economy. Upwork doesn't serve Nigeria. Stripe doesn't do NGN. We're building for **Africa, starting with Nigeria**. | — |
| 0:20 – 0:50 | **AI Project Brief Generator** — Describe a project in plain language ("I need a website for my Lagos bakery with online ordering"). AI generates a structured brief: title, scope, deliverables, skills, complexity, timeline, clarifying questions. All editable before saving. | Groq AI — `openai/gpt-oss-20b` @ 500 tok/s |
| 0:50 – 1:20 | **AI Milestone Generator** — Click "AI Generate" on the milestones tab. AI suggests a milestone breakdown with deliverables, acceptance criteria, dependencies, and payment percentages. Supports all 3 funding arrangements. | Groq AI + project context |
| 1:20 – 1:50 | **Pay with PayPal** — Click "Pay with PayPal" on a ₦450,000 milestone. Show USD conversion ($300 at 1 USD = ₦1,500). PayPal sandbox opens. Approve payment. Webhook fires. Milestone status → "Funded". | PayPal Orders API v2 + Webhook API |
| 1:50 – 2:20 | **AI Contract Analysis** — Open the contract. Click "Analyze". AI produces a dashboard report: risk score (0-100), severity stat cards (Total/High/Medium/Low), key findings table with colored severity badges, missing information, recommendations. | Groq AI — dashboard report renderer |
| 2:20 – 2:50 | **AI Dispute Summary** — Open a dispute. Click "Generate neutral summary". AI produces timeline, agreed vs. submitted deliverables, gaps, key claims from both parties, recommended next steps. Strictly neutral — never decides. | Groq AI + authorized project records |
| 2:50 – 3:00 | **Wrap** — "Cross-border escrow via PayPal + 5 AI features that build trust. Built for Africa, starting with Nigeria." | — |

---

## Security measures

- **Server-side API keys only** — GROQ_API_KEY and PayPal credentials never exposed to frontend, never in NEXT_PUBLIC_ vars, never committed to git
- **Authentication required** on every API route (`requireUserId`)
- **Role-based authorization** — project membership checks before AI calls on project-scoped data
- **Input validation** — Zod schemas with length limits on all AI routes
- **Rate limiting** — 20 RPM per user, 30 RPM per IP (shared across all AI features)
- **Prompt injection defense** — sanitizes PII (JWT, email, phone, BVN, NIN, card, IBAN), strips zero-width chars, bidi-overrides, instruction-shaped lines
- **Disclosure resistance** — system prompts include anti-reveal clauses
- **Response post-filtering** — filters injection compliance markers from AI output
- **Structured output validation** — JSON validated against TypeScript interfaces before use
- **PayPal webhook verification** — official `verify-webhook-signature` API, fails safe if unconfigured
- **AI never executes DB/payment operations** — routes only persist audit events with metadata
- **Advisory-only labeling** — every AI panel shows "AI-generated. Advisory only." banner

---

## Verification steps for judges

1. **Confirm PayPal is integrated:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/lib/payments/paypal-provider.ts
   ```

2. **Confirm Groq AI is integrated:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/lib/ai/ai-provider.ts src/lib/ai/groq.ts src/lib/ai/prompts.ts
   ```

3. **Confirm 5 AI API routes exist:**
   ```bash
   ls src/app/api/ai/*/route.ts
   ```

4. **Confirm live deployment works:**
   - Visit https://gigsure-ai.vercel.app/
   - Login → open a project → try AI assistants, AI milestone generator, AI contract analysis
   - Open Funding tab → see "Pay with PayPal" card

---

## Cost guardrails

- PayPal sandbox: **$0** — no real money moves
- Groq AI free tier: **$0** — 30 RPM / 1,000 RPD, no credit card required
- Vercel free tier: **$0** — serverless functions, auto-deploy
- Estimated total hackathon spend: **$0**

---

## What this enables

For the first time, an international client can:

1. Hire a Nigerian professional on GigSure
2. **AI generates the project brief** from a plain-language description
3. **AI suggests milestones** with deliverables, acceptance criteria, and payment splits
4. Fund a milestone in **USD via PayPal** (the currency they have)
5. The Nigerian professional receives **NGN via Monnify/OPay** (the currency they need)
6. **AI analyzes the contract** for risks before anyone signs
7. **Escrow** holds funds under GigSure Payment Protection until milestones are met
8. If there's a dispute, **AI produces a neutral summary** — timeline, gaps, claims, next steps
9. Human review is mandatory — AI never decides disputes or releases funds

**No Western platform has this.** Upwork doesn't serve this market. Stripe doesn't process NGN payouts. This is a novel capability — **built for Africa, starting with Nigeria.**

---

## Team

- **Ahmad Muhammad Wammi** (0xFlux4hm) — founder + tech lead, Lagos 🇳🇬. Cybersecurity bug hunter. Building GigSure AI.

---

## Tools used

| Tool | How it was used |
|---|---|
| **PayPal Orders API v2** | Cross-border USD payment orders for NGN milestones |
| **PayPal OAuth 2.0** | Server-to-server authentication |
| **PayPal Webhook verification** | Official API for signature verification |
| **PayPal Refunds API** | Milestone refunds through PayPal |
| **PayPal Sandbox** | All testing — no real money |
| **Groq AI (openai/gpt-oss-20b)** | 5 AI features: project brief, milestone generator, contract analysis, 10 assistants, dispute summary |
| **Next.js 16** | Full-stack framework (App Router, API routes, server components) |
| **Prisma + PostgreSQL** | Database ORM + schema (40 models) |
| **Tailwind CSS v4** | Styling + design system |
| **Vercel** | Deployment + serverless functions |
| **Monnify + OPay** | NGN payout rails for Nigerian freelancers |
| **Smile ID** | KYC verification (NIN + selfie liveness) |
