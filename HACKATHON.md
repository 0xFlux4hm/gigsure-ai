# GigSure AI — PayPal AI Hackathon Submission

> **Track:** Open (no prescribed tracks)
> **Prize targets:** Best Use of PayPal + AI, Best Use of Agentic Commerce, Most Impactful
> **Builder:** Ahmad Muhammad Wammi (0xFlux4hm) — Lagos, Nigeria
> **Build period:** October 30 — November 12, 2026
> **Submission deadline:** Wed Nov 4 wait no — Wed Nov 12, 2026, 9 PM ET (Thu Nov 13, 2 AM WAT)

## What's new in this submission

Per the PayPal AI Hackathon rules:

> *"Entrants must build or update an application that integrates the PayPal developer platform (using the free sandbox environment) along with an AI tool, model, or platform of their choice."*

This document identifies everything built during the hackathon. The pre-hackathon baseline is git tag `pre-paypal-hackathon-2026-10-30` (commit `61388a6`). Judges can verify new work with:

```bash
git fetch --tags
git log pre-paypal-hackathon-2026-10-30..main --oneline
git diff pre-paypal-hackathon-2026-10-30..main --stat
```

## Pre-hackathon baseline (existing foundation — NOT demoed)

GigSure AI was a real product before the hackathon. The following existed at the `pre-paypal-hackathon-2026-10-30` tag and is **NOT shown in the demo** (existing infrastructure only):

- Email + password authentication with email verification
- Google OAuth sign-in (with consent screen + PENDING_REGISTRATION flow)
- Project CRUD with memberships (OWNER, MEMBER, REVIEWER roles)
- Contract versioning + acceptance workflow
- Milestone-based funding with escrow via Monnify + OPay (real Nigerian payment rails)
- Dispute resolution with evidence uploads + reviewer workflow
- KYC via Smile ID (NIN + selfie liveness)
- 7 AI advisory assistants (Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress) — already integrated with the Z.AI SDK
- Notifications, audit log with hash chain, per-session JWT revocation
- NDPR data subject rights (export, delete)

These features are real and live in production but, per hackathon rules, are **not** part of the demo video.

## Hackathon scope (Oct 30 – Nov 12 — what we'll demo)

The hackathon work adds **PayPal cross-border funding** to the existing GigSure AI product, alongside the existing AI agents. The PayPal integration is the centerpiece of the demo.

### PayPal technologies used

| PayPal API / capability | Where it's used |
|---|---|
| **Orders API v2** (`POST /v2/checkout/orders`) | Creating cross-border USD payment orders for NGN milestones |
| **OAuth 2.0 token endpoint** (`POST /v1/oauth2/token`) | Server-to-server authentication with PayPal |
| **Webhook verification API** (`POST /v1/notifications/verify-webhook-signature`) | Robust signature verification using PayPal's official API (not the older CRC32 scheme) |
| **Refunds API** (`POST /v2/payments/captures/{id}/refund`) | Processing milestone refunds through PayPal |
| **Sandbox environment** | All testing uses developer.paypal.com sandbox — no real money moves |

### AI tools used

The hackathon rules say "any AI tool works." GigSure uses the **Z.AI SDK** for its 7 AI assistants (already integrated in the pre-hackathon baseline). The PayPal integration adds a new use case for the existing assistants: **AI-driven cross-border risk analysis** for international PayPal transactions.

### New files

| File | Purpose |
|---|---|
| `src/lib/payments/paypal-provider.ts` (new, ~430 lines) | PayPal provider adapter implementing GigSure's `PaymentProvider` interface — auth, payments, refunds, webhook verification, health check. Cross-border USD→NGN conversion at the platform demo rate (1 USD = ₦1,500). |
| `src/views/ProjectFundingView.tsx` (modified) | Added `PayPalFundingCard` component — milestone selector, USD amount display, "Pay with PayPal" button, opens PayPal sandbox checkout in a new tab |

### Modified files

| File | Change |
|---|---|
| `src/lib/payments/provider-interface.ts` | Added `"paypal"` to the `PaymentProviderName` union type |
| `src/lib/payments/registry.ts` | Registered `PayPalProvider` — providers can now be `monnify`, `opay`, or `paypal`. Default selection logic updated. |
| `src/app/api/payments/initiate/route.ts` | Added `paypal` to the provider Zod schema — clients can now POST `{ provider: "paypal" }` |
| `src/app/api/payments/webhook/[provider]/route.ts` | Added PayPal webhook handling — accepts `/api/payments/webhook/paypal`, normalizes PayPal's snake_case event fields (`event_type`, `create_time`), extracts amount from `resource.amount.total`, maps PayPal event types to GigSure funding statuses |
| `.env.local` (gitignored) | Added `PAYPAL_ENABLED`, `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` placeholders |

## PayPal integration architecture

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
6. PayPal webhook fires at `/api/payments/webhook/paypal` (`PAYMENT.CAPTURE.COMPLETED` event)
7. Server verifies the webhook via PayPal's official `verify-webhook-signature` API
8. Funds are recorded in the FundingRecord (in NGN, converted back from USD)
9. Escrow holds the funds
10. On milestone completion, Monnify/OPay pays out to the freelancer's bank account in NGN

### Webhook security

PayPal webhook verification uses the **official API** at `POST /v1/notifications/verify-webhook-signature` (not the older CRC32-based scheme). This is more robust because:

- PayPal handles the cryptographic verification server-side
- Works with any webhook event type
- Doesn't require manual certificate fetching + signature computation

The verification call sends PayPal's transmission headers (`paypal-transmission-id`, `paypal-transmission-sig`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-time`) plus the webhook ID + the raw event body. PayPal responds with `verification_status: "SUCCESS"` or `"FAILURE"`.

If `PAYPAL_WEBHOOK_ID` is not configured, the verifier fails safe (returns `valid: false`) — no unverified webhook is ever processed.

## Environment variables (in `.env.local`, gitignored)

```bash
# PayPal (PayPal AI Hackathon — sandbox only)
PAYPAL_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox  # or "production" for live (not used in hackathon)
PAYPAL_CLIENT_ID=<from developer.paypal.com dashboard>
PAYPAL_CLIENT_SECRET=<from developer.paypal.com dashboard>
PAYPAL_WEBHOOK_ID=<from developer.paypal.com → Apps & Credentials → Webhooks>
```

### Vercel environment variables (production demo)

When deploying to Vercel, set these in the Vercel project settings:

```
DATABASE_URL=<your-postgres-url>
NEXTAUTH_SECRET=<32+ char random string>
NEXTAUTH_URL=<your-vercel-domain>
PAYPAL_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=<from developer.paypal.com>
PAYPAL_CLIENT_SECRET=<from developer.paypal.com>
PAYPAL_WEBHOOK_ID=<from developer.paypal.com>
GOOGLE_CLIENT_ID=<if-google-oauth-enabled>
GOOGLE_CLIENT_SECRET=<if-google-oauth-enabled>
SMTP_URL=<if-email-enabled>
```

## Demo script (3-minute video)

The 3-min demo shows only new PayPal-powered features. Existing GigSure infrastructure (auth, projects, contracts, escrow) is setup, not showcase.

| Time | Demo beat | Tech shown |
|---|---|---|
| 0:00 – 0:30 | **"Why this, why now"** — Ahmad introduces himself (Lagos-based, cybersecurity bug hunter) and the problem: Nigerian independent professionals lose money to FX depreciation and unreliable cross-border payment infrastructure. Upwork doesn't serve this market. | — |
| 0:30 – 1:15 | **Open project, view milestone** — Show a project with a ₦450,000 milestone. Highlight that the existing NGN escrow is in place. | Existing GigSure |
| 1:15 – 2:15 | **Pay with PayPal** — Click "Pay with PayPal" on the milestone. Show the USD conversion (₦450,000 → $300 at 1 USD = ₦1,500). PayPal sandbox opens. Approve the test payment. Webhook fires. Milestone status updates to "Funded". | PayPal Orders API v2 + Webhook API |
| 2:15 – 2:45 | **AI assistant analyzes the cross-border transaction** — Open the Funding Assistant. Ask "What's the status of this funding?" The AI summarizes the cross-border flow, the FX rate used, and confirms escrow is held. | Z.AI SDK (existing) + new PayPal data |
| 2:45 – 3:00 | **Wrap** — Recap: cross-border escrow via PayPal + AI agents that understand the transaction. Built for Africa's independent services market. | — |

## Team

- **Ahmad Muhammad Wammi** (0xFlux4hm) — founder + tech lead, Lagos 🇳🇬. Cybersecurity bug hunter. Building GigSure AI.

(Add teammates here as they join — max 4 total per rules.)

## Verification steps for judges

1. **Confirm PayPal is integrated:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/lib/payments/paypal-provider.ts
   ```
   Should show the new ~430-line PayPal provider with OAuth, Orders API, Refunds API, and webhook verification.

2. **Confirm PayPal is registered:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/lib/payments/registry.ts
   ```
   Should show `PayPalProvider` imported + registered alongside Monnify + OPay.

3. **Confirm new UI exists:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/views/ProjectFundingView.tsx
   ```
   Should show the new `PayPalFundingCard` component + "Pay with PayPal" button.

4. **Confirm webhook handler accepts PayPal:**
   ```bash
   git diff pre-paypal-hackathon-2026-10-30..main -- src/app/api/payments/webhook/[provider]/route.ts
   ```

5. **Confirm live deployment works:**
   - Visit the Vercel deployment URL (TBD)
   - Login (use the demo account)
   - Open a project → Funding tab → see "Pay with PayPal" card
   - Click "Pay $X.XX with PayPal" → PayPal sandbox opens

## Cost guardrails

- PayPal sandbox is **free** — no real money moves, no per-transaction cost
- AI assistants: max 800 tokens per call (~$0.003/call on Z.AI SDK)
- Per-user AI rate limit: 20 calls / hour
- Estimated total spend during hackathon: $0 (PayPal sandbox) + ~$5 (AI calls)

## What this enables

For the first time, an international client can:

1. Hire a Nigerian professional on GigSure
2. Fund a milestone in **USD via PayPal** (the currency they have)
3. The Nigerian professional receives **NGN via Monnify/OPay** (the currency they need)
4. **AI agents** handle the cross-border transaction analysis, contract risk review, and dispute resolution
5. **Escrow** holds funds under GigSure Payment Protection until milestones are met

No Western platform has this. Upwork doesn't serve this market. Stripe doesn't process NGN payouts. This is a novel capability enabled by the PayPal + Z.AI integration.
