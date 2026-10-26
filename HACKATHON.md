# GigSure AI — Meta Global AI Developer Hackathon Submission

> **Track:** Startup
> **Problem Statement:** Build for Your World
> **Builder:** Ahmad Muhammad Wammi (0xFlux4hm) — Lagos, Nigeria
> **Build period:** October 26 — November 4, 2026
> **Submission deadline:** Wed Nov 4, 9 PM ET (Thu Nov 5, 2 AM WAT)

## What's new in this submission

This document identifies everything built during the hackathon. Per the rules:

> *"Your demo has to show only the features, code and functionality your team built during the event. Judges need to be able to tell what's new. If they can't, the project is disqualified."*

The pre-hackathon baseline is git tag `pre-hackathon-2026-10-26` (commit `1cf8d83`).
Judges can verify new work with:

```bash
git fetch --tags
git log pre-hackathon-2026-10-26..main --oneline
git diff pre-hackathon-2026-10-26..main --stat
```

Everything below the tag is new work built Oct 26 – Nov 4.

## Pre-hackathon baseline (existing foundation — NOT demoed)

GigSure AI was a real product before the hackathon. The following existed at the `pre-hackathon-2026-10-26` tag and is **NOT shown in the demo**:

- Email + password authentication with email verification
- Google OAuth sign-in (with consent screen + PENDING_REGISTRATION flow)
- Project CRUD with memberships (OWNER, MEMBER, REVIEWER roles)
- Contract versioning + acceptance workflow
- Milestone-based funding with escrow via Monnify + OPay (real payment rails)
- Dispute resolution with evidence uploads + reviewer workflow
- KYC via Smile ID (NIN + selfie liveness)
- Notifications, audit log with hash chain, per-session JWT revocation
- NDPR data subject rights (export, delete)
- Security audit completed (42 vulnerabilities fixed across Critical/High/Medium/Low)

These features are real and live in production but, per hackathon rules, are **not** part of the demo video.

## Hackathon scope (Oct 26 – Nov 4 — what we'll demo)

The hackathon work integrates Meta's models into the existing GigSure AI product. The Meta Model API is the only AI provider used in the new code.

### Meta models used

| Model | Where it's used | Why this model |
|---|---|---|
| **Muse Spark 1.3** (`muse-spark-1.3`) | 5 of 7 AI assistants: Team Planner, Task Planner, Funding, Evidence, Progress | Agentic + fast responses for advisory tasks |
| **Muse Wonder 1.0** (`muse-wonder-1.0`) | 2 of 7 AI assistants: Contract, Risk | Multi-step reasoning needed for clause ambiguity detection + cross-referencing tasks/milestones/members for risk |
| **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) | Dispute evidence upload — WhatsApp voice notes → searchable transcript | **Killer feature.** Meta's voice model is uniquely strong on Nigerian Pidgin, Yoruba, Hausa, Igbo — languages Western providers (Google, Deepgram) handle poorly. This is the "only Meta can do this" moment. |
| **Muse Image** (`muse-image-1.0`) | Deliverable preview generation | Helps non-technical clients align with freelancers before work starts |

### New files

| File | Purpose |
|---|---|
| `src/lib/meta/client.ts` | Meta Model API adapter (auth, retries, timeouts, error handling). Single entry point for all Meta calls. |
| `src/app/api/ai/voice-transcribe/route.ts` | (Planned) Endpoint to accept an audio upload, transcribe via Muse Voice Transcribe, attach transcript to dispute evidence |
| `src/app/api/ai/deliverable-preview/route.ts` | (Planned) Endpoint to generate a deliverable preview image via Muse Image |
| `src/views/AiAssistantView.tsx` | (Planned) New UI showing which Meta model is being used per assistant |
| `tests/security/meta-adapter.test.ts` | (Planned) Regression tests for the Meta adapter |

### Modified files

| File | Change |
|---|---|
| `src/app/api/ai/assistant/route.ts` | Swapped `z-ai-web-dev-sdk` import for `@/lib/meta/client`. Each assistant now declares which Meta model it uses (Muse Spark default, Muse Wonder for Contract + Risk). Preserved all existing security scaffolding (rate limits, prompt-injection defense via context delimiters, PII sanitization, audit log). |
| `.env.local` | Added `META_API_KEY` + `META_API_BASE_URL` (gitignored, never committed) |

## Tooling used during the hackathon

- **Meta Model API** — direct API calls via fetch (no SDK), through the `src/lib/meta/client.ts` adapter
- **Muse Code** — used for some scaffolding tasks during the build (mentioned in the hackathon guide as a permitted tool)
- **Z.AI coding agent** — primary coding agent for context continuity with the existing codebase
- **Vercel** — hosting the live demo deployment (separate `gigsure-hackathon` project)

## Meta Model API setup

### Base URL
```
https://api.meta.ai/v1
```

### Authentication
```
Authorization: Bearer LLM_<api_key>
```

API keys are prefixed with `LLM_` per https://dev.meta.ai/docs/authentication.

### Endpoints used

| Endpoint | Purpose |
|---|---|
| `POST /v1/chat/completions` | OpenAI-compatible chat (Muse Spark, Muse Wonder) |
| `POST /v1/asr/transcribe` | Voice transcription (Muse Voice Transcribe) |
| `POST /v1/images/generations` | Image generation (Muse Image) |
| `GET /v1/models` | Account-status check (used to verify billing is unfrozen before deeper calls) |

### Environment variables (in `.env.local`, gitignored)

```bash
META_API_KEY=LLM_xxxxxxxxxxxxxxxx
META_API_BASE_URL=https://api.meta.ai/v1
# Optional: use Contributor mode (cheaper, but Meta may use content for training)
# META_USE_CONTRIBUTOR_MODE=true
```

### Vercel environment variables (production demo)

When deploying to Vercel, set these in the Vercel project settings:

```
DATABASE_URL=<your-postgres-url>
NEXTAUTH_SECRET=<32+ char random string>
NEXTAUTH_URL=<your-vercel-domain>
META_API_KEY=LLM_xxxxxxxxxxxxxxxx
META_API_BASE_URL=https://api.meta.ai/v1
GOOGLE_CLIENT_ID=<if-google-oauth-enabled>
GOOGLE_CLIENT_SECRET=<if-google-oauth-enabled>
SMTP_URL=<if-email-enabled>
```

## Demo script (3-minute video)

The 3-minute demo shows only new Meta-powered features.

| Time | Demo beat | Meta model |
|---|---|---|
| 0:00 – 0:30 | **"Why this, why now"** — Ahmad introduces himself (Lagos-based, cybersecurity bug hunter + freelancer pain firsthand) and the problem: Nigerian freelancers get burned by vague scopes, unpaid milestones, voice-only evidence that gets lost. | — |
| 0:30 – 1:15 | **AI Contract Review** — User opens a project's contract, clicks "Review with AI". Muse Wonder flags ambiguous clauses + liability chains. | Muse Wonder 1.0 |
| 1:15 – 2:00 | **Voice Evidence Transcription** — User uploads a WhatsApp voice note (in Pidgin/Yoruba) as dispute evidence. Muse Voice Transcribe transcribes it into the timeline. The transcript is searchable. | Muse Voice Transcribe 1.0 |
| 2:00 – 2:30 | **AI Project Risk** — User opens a project dashboard, clicks "Analyze Risks". Muse Wonder identifies overdue tasks + unclear responsibilities. | Muse Wonder 1.0 |
| 2:30 – 3:00 | **Team Planner + ask** — User creates a new project, asks Muse Spark to suggest roles. Wrap with team + submission URL. | Muse Spark 1.3 |

## Team

- **Ahmad Muhammad Wammi** (0xFlux4hm) — founder + tech lead, Lagos 🇳🇬. Cybersecurity bug hunter. Building GigSure AI.

(Add teammates here as they join — max 4 total per rules.)

## Verification steps for judges

1. **Confirm Meta models are integrated:**
   ```bash
   git diff pre-hackathon-2026-10-26..main -- src/app/api/ai/assistant/route.ts
   ```
   Should show: `import ZAI from "z-ai-web-dev-sdk"` removed, `import { chatCompletion, META_MODELS } from "@/lib/meta/client"` added, and `cfg.model` declarations per assistant.

2. **Confirm new Meta adapter exists:**
   ```bash
   cat src/lib/meta/client.ts | head -50
   ```

3. **Confirm live deployment works:**
   - Visit the Vercel deployment URL (TBD)
   - Login (use the demo account)
   - Open a project → AI assistant → see Muse Spark / Muse Wonder responses

4. **Confirm voice transcription works:**
   - Open a dispute → upload a voice note (sample provided in demo)
   - See the transcript appear in the timeline

## Cost guardrails

- Default `max_tokens: 800` per assistant call (~$0.003 on Standard Muse Spark 1.3)
- Hard cap at 4000 tokens per call (~$0.017)
- Per-user rate limit: 20 calls / hour
- Per-IP rate limit: 50 calls / hour
- Estimated total API spend during hackathon: < $20 of the $150 credits
