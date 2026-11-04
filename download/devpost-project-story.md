# Devpost Project Story (paste into the "Project Story" field)

## Inspiration

Africa's independent professionals — developers, designers, writers, consultants — are invisible to the global gig economy. **Upwork doesn't serve Nigeria.** Stripe doesn't process NGN payouts. When African freelancers DO find international clients, there's no trust layer — no contract protection, no milestone-gated payments, no way for the client to pay in their currency.

I'm Ahmad Muhammad Wammi, a cybersecurity bug hunter based in Lagos, Nigeria. I've seen firsthand how Nigerian professionals lose money to FX depreciation, unclear requirements, unpaid completed work, and he-said-she-said disputes with no records. The existing platforms weren't built for us.

So I built GigSure AI. We're solving for **Africa, starting with Nigeria.**

## What it does

GigSure AI is an AI-powered project contract and payment transparency platform connecting international clients with skilled African professionals. It is **NOT a freelance marketplace** — it's a trust layer. Clients bring their own freelancers; GigSure ensures everyone gets paid fairly.

### PayPal Integration — Cross-Border Milestone-Gated Payments

International clients fund milestones in **USD via PayPal**. The Nigerian professional receives **NGN via Monnify/OPay**. GigSure's milestone-gated payment system holds the funds at the payment provider until milestones are met.

**PayPal APIs used:**
- **Orders API v2** (`POST /v2/checkout/orders`) — creating cross-border USD payment orders for NGN milestones
- **OAuth 2.0** (`POST /v1/oauth2/token`) — server-to-server authentication
- **Webhook verification API** (`POST /v1/notifications/verify-webhook-signature`) — official signature verification using PayPal's API (not the older CRC32 scheme)
- **Refunds API** (`POST /v2/payments/captures/{id}/refund`) — processing milestone refunds
- **Sandbox environment** — all testing, no real money moves

**Cross-border flow:**
1. International client clicks "Pay with PayPal" on a ₦50,000 milestone
2. GigSure converts NGN → USD at the demo rate (1 USD = ₦1,500) → $33.33
3. Server creates a PayPal Order via Orders API v2
4. Client approves the USD payment in PayPal sandbox
5. PayPal webhook fires at `/api/payments/webhook/paypal` (`PAYMENT.CAPTURE.COMPLETED`)
6. Server verifies the webhook via PayPal's official `verify-webhook-signature` API
7. Funds are recorded in NGN and held under GigSure Payment Protection
8. On milestone completion, Monnify/OPay pays out to the freelancer's bank account in NGN

### AI Integration — 5 Production AI Features powered by Groq

Running on **Groq's LPU hardware** at **500+ tokens per second** with `openai/gpt-oss-20b`. Free tier: 30 RPM / 1,000 RPD, no credit card required.

**1. AI Project Brief Generator** — Customer describes a project in plain language ("I need a website for my Lagos bakery with online ordering"). AI generates a structured brief: title, overview, scope of work, deliverables, skills required, complexity rating, clarifying questions, and estimated timeline. All editable before saving.

**2. AI Milestone Generator** — Analyzes project scope + funding arrangement and suggests a milestone breakdown with deliverables, acceptance criteria, dependencies, estimated days, and payment percentages. Supports all three GigSure funding arrangements (full / milestone / upfront + milestones). Never invents actual payment amounts — only percentages. The customer and worker must review and agree.

**3. AI Contract Analysis** — Clause-by-clause contract review. Identifies risks across 8 categories: missing information, ambiguous obligations, unclear deliverables, missing acceptance criteria, unspecified deadlines, payment inconsistencies, conflicting clauses, and completion conditions. Produces a dashboard report with risk score (0-100), severity stat cards, a key findings table with colored severity badges, and actionable recommendations. Never provides legal advice.

**4. AI Project Assistant (10 assistants)** — Team Planner, Task Planner, Contract Assistant, Funding Assistant, Project Risk Assistant, Evidence Assistant, Progress Assistant + 3 new: Project Brief Helper, Milestone Helper, Dispute Helper. All advisory only — AI never authorizes payments, releases funds, or makes binding decisions. Each produces a structured research report with executive summary, key findings table, detailed analysis, recommendations, and confidence rating.

**5. AI Dispute Summary** — Neutral summary of a dispute using authorized project records. Produces a timeline of events, agreed vs. submitted deliverables, gaps between what was promised and what was delivered, key claims from both parties, clarifying questions, and recommended next steps (administrative only — NEVER financial). Strictly neutral. Human review is mandatory.

### AI Safety Guardrails
- Advisory only — AI never authorizes payments, releases funds, freezes accounts, or makes binding decisions
- Prompt injection defense — sanitizes all user input (strips JWTs, emails, phones, BVN/NIN, cards, IBANs, zero-width chars, instruction injection patterns)
- Disclosure resistance — system prompts include anti-reveal clauses
- Response post-filtering — filters injection compliance markers from AI output
- Structured output validation — JSON responses validated against TypeScript schemas
- Per-user rate limiting — 20 AI calls/hour per user

## How we built it

**Tech stack:**
- **Next.js 16** (App Router, API routes, server components)
- **TypeScript** throughout
- **Prisma + PostgreSQL** (40 database models)
- **Tailwind CSS v4** with a custom premium design system
- **Vercel** for deployment (serverless functions, auto-deploy from GitHub)

**PayPal integration:**
- Built a custom `PayPalProvider` adapter (~430 lines) implementing GigSure's `PaymentProvider` interface
- OAuth 2.0 token caching (access tokens last ~1 hour)
- Cross-border USD→NGN conversion at the platform demo rate
- Webhook verification using PayPal's official `verify-webhook-signature` API
- Registered alongside existing Monnify + OPay providers

**AI integration:**
- Built a unified OpenAI-compatible provider abstraction (`ai-provider.ts`) supporting 5 backends: Groq, Z.AI, Gemini, DeepSeek, AgentRouter. Currently active: Groq
- Reusable AI service module (`groq.ts`) with `callAI()`, `extractJson()`, and 4 feature functions
- 5 system prompts with TypeScript interfaces (`prompts.ts`)
- Dashboard-style report renderer that parses AI markdown output into stat cards, severity badges, styled tables, and recommendations sections
- 5-minute in-memory response cache to deduplicate identical AI calls (extends effective free-tier quota 5-10×)
- Smart retry logic: fails fast on per-minute rate limits (retrying burns more of the same quota), retries on transient 500/502/503

**Security:**
- Server-side API keys only — GROQ_API_KEY and PayPal credentials never exposed to frontend, never in NEXT_PUBLIC_ vars, never committed to git
- Authentication required on every API route
- Role-based authorization — project membership checks before AI calls on project-scoped data
- Input validation with Zod schemas
- OWASP A01 server-side access control (58 endpoints hardened)

## Challenges we ran into

**PayPal webhook verification:** Initially tried the older CRC32-based certificate verification scheme, but it was fragile and required manual certificate fetching. Switched to PayPal's official `verify-webhook-signature` API — more robust, works with any event type, and PayPal handles the crypto server-side.

**AI response rendering:** The AI outputs were showing raw Markdown (`**`, `|`, `##`) instead of formatted HTML. The `@tailwindcss/typography` plugin's `prose` classes weren't being generated in Tailwind v4. Solved by rewriting the renderer to use explicit Tailwind utility classes on each element via the `react-markdown` components override map.

**AI rate limiting:** Groq's free tier has 30 RPM. Our initial retry logic (4 attempts with 2s/4s/8s backoff) was counterproductive — each retry counted against the same per-minute quota, burning 4× the quota for a single user request. Fixed by detecting Gemini/Groq 429s and failing fast instead of retrying.

**Mobile form UX:** All 11 forms in the app used cramped Dialog modals that didn't fit on mobile screens. Converted every single one to responsive Sheet components (full-screen on mobile, side sheet on desktop) with scrollable content areas, sticky headers/footers, and mobile keyboard optimization.

## Accomplishments that we're proud of

- **Cross-border milestone-gated payments** — No Western platform does USD→NGN cross-border payment protection. PayPal holds the USD, Monnify holds the NGN, GigSure controls the release. Novel capability.
- **5 AI features on Groq's free tier** — Project brief generator, milestone generator, contract analysis (8 risk categories), 10 AI assistants, and neutral dispute summary. All at $0 cost.
- **Dashboard-style AI reports** — AI output looks like a McKinsey analyst memo, not a chatbot response. Stat cards, severity badges, styled tables, recommendations sections.
- **$0 total cost** — PayPal sandbox is free, Groq free tier is free, Vercel free tier is free. The entire hackathon cost nothing to run.
- **Real product** — GigSure AI was a real product before the hackathon. The PayPal + Groq integration adds genuine cross-border payment + AI capabilities to an existing platform with 40 database models, KYC verification, contract versioning, and dispute resolution.

## What we learned

- **PayPal's webhook verification API** is the right approach (not CRC32). It's more robust, works with any event type, and PayPal handles the cryptography.
- **Groq's LPU hardware** is genuinely fast — 500+ tokens/sec means AI responses appear in under 1 second, making the UX feel instant.
- **Tailwind v4** has a different plugin system than v3. The `@plugin` directive works, but `prose` classes from `@tailwindcss/typography` may not be generated reliably. Explicit utility classes are more dependable.
- **Rate limit psychology matters** — retrying a per-minute rate limit makes it worse, not better. The right strategy is to fail fast and tell the user to wait 60 seconds.

## What's next for GigSure AI

- **Expand across Africa** — Ghana, Kenya, South Africa next. Add local payment rails (M-Pesa, Mobile Money) alongside Monnify/OPay.
- **AI-powered contract drafting** — Generate full contract text from the project brief + milestone plan, not just analyze existing contracts.
- **PayPal production** — Move from sandbox to live PayPal for real cross-border transactions.
- **Multi-currency milestones** — Let clients set milestone amounts in their own currency, with real-time FX conversion via PayPal's rates API.

---

**Built for Africa, starting with Nigeria.** 🇳🇬
