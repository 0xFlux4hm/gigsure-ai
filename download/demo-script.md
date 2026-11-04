# GigSure AI — PayPal AI Hackathon Demo Script

> **Duration:** 3 minutes
> **Speaker:** Ahmad Muhammad Wammi
> **Videos used:** `gigsure homepage.mp4` (landing page) + `gigsure ai .mp4` (app demo)
> **Live app:** https://gigsure-ai.vercel.app/

---

## NARRATION SCRIPT

### [0:00 — 0:15] The Problem — "Africa is invisible to the global gig economy"

**[SHOW: Homepage video — landing page features section]**

> "My name is Ahmad, I'm a cybersecurity bug hunter based in Yobe, Nigeria.
>
> Africa's independent professionals — developers, designers, writers — are invisible to the global gig economy. Upwork doesn't serve Nigeria. Stripe doesn't process NGN payouts. When African freelancers DO find international clients, there's no trust layer — no contract protection, no milestone-gated payments, no way for the client to pay in their currency.
>
> So I built GigSure AI. We're solving for Africa, starting with Nigeria."

---

### [0:15 — 0:30] The Platform — "What GigSure AI gives you"

**[SHOW: Homepage video — "Six pillars" section + "From handshake to paid" 6-step process]**

> "GigSure AI is a project contract and payment transparency platform. Six pillars: versioned contracts, secure collaboration, milestone funding, dispute resolution, AI assistants, and privacy by design.
>
> The flow is simple — sign in, create a project, invite service providers, draft contracts, fund milestones, and if there's a dispute, resolve it with evidence and advisory AI summaries.
>
> Built for the Nigerian service provider market. Work with confidence. Get paid with trust."

---

### [0:30 — 0:50] Dashboard — Account Setup + KYC

**[SHOW: Main demo video — Dashboard view]**

> "Here's the dashboard. I have one active project and ₦100,000 in earnings.
>
> The Account Setup checklist shows KYC is verified — that's NIN plus selfie liveness check via Smile ID. The next step is adding a bank account for payouts via Monnify or OPay.
>
> This is the trust foundation — before anyone can fund a milestone, the freelancer's identity is verified."

---

### [0:50 — 1:25] PayPal Cross-Border Payment — "The centerpiece"

**[SHOW: Main demo video — Project Funding page with PayPal]**

> "Now the key feature. An international client wants to fund a milestone. The milestone is ₦50,000 Nigerian Naira.
>
> GigSure converts this to USD at our demo rate — 1 USD equals 1,500 Naira. The client pays just $33.33 via PayPal.
>
> Here's how it works:
> 1. The client clicks 'Pay with PayPal' — PayPal sandbox opens
> 2. They approve the payment in USD
> 3. PayPal sends a webhook to our server
> 4. We verify it using PayPal's official webhook verification API
> 5. The funds are recorded in Naira and held under GigSure Payment Protection
> 6. On milestone completion, the freelancer receives NGN via Monnify or OPay
>
> This is cross-border escrow — without the escrow license. PayPal holds the USD, Monnify holds the NGN, and GigSure controls the release. No Western platform does this."

---

### [1:25 — 1:55] AI Contract Analysis — "Dashboard report, not chatbot text"

**[SHOW: Main demo video — AI Assistants → Project Risk Assistant]**

> "Now let's talk about AI. We use Groq's LPU hardware — that's 500+ tokens per second on the openai/gpt-oss-20b model. Free tier, no credit card.
>
> Here's the Project Risk Assistant. I type 'plan' and run it. Within seconds, the AI produces a structured risk assessment report — not raw text, but a dashboard.
>
> Three risks found: one HIGH, one MEDIUM, one LOW. The stat cards show the breakdown. The key findings table has severity badges — red for HIGH, amber for MEDIUM, blue for LOW — with evidence cited from the actual project data, and impact analysis for each.
>
> All advisory only. The AI never authorizes payments or makes binding decisions."

---

### [1:55 — 2:25] AI Project Brief Helper — "Expert research-grade output"

**[SHOW: Main demo video — Project Brief Helper response]**

> "Here's another assistant — the Project Brief Helper. I ask it to 'brief us about the projects' and it analyzes what's missing.
>
> The AI identifies six missing elements — detailed task list, client contact details, milestone deliverables, acceptance criteria, communication plan, risk mitigation strategy. For each, it explains why it matters and suggests a clarifying question.
>
> This is a structured research report — not a chatbot response. Stat cards, severity badges, styled tables, recommendations. The same format a McKinsey analyst would produce, but generated in under a second on Groq's LPU hardware."

---

### [2:25 — 2:45] The Full Picture — "What this enables"

**[SHOW: Main demo video — quick cut through dashboard → funding → AI assistants]**

> "So here's what GigSure AI enables for the first time:
>
> An international client can hire a Nigerian professional, AI generates the project brief, AI suggests milestones with payment splits, the client funds in USD via PayPal, the freelancer receives NGN via Monnify, AI analyzes the contract for risks before anyone signs, and if there's a dispute, AI produces a neutral summary with timeline, gaps, and claims from both parties.
>
> All for zero cost — PayPal sandbox is free, Groq AI is free, Vercel is free."

---

### [2:45 — 3:00] Close — "Built for Africa, starting with Nigeria"

**[SHOW: Homepage video — footer "Work with confidence. Get paid with trust."]**

> "No Western platform has this. Upwork doesn't serve this market. Stripe doesn't process NGN. PayPal plus AI equals trust and transparency for Africa's independent professionals.
>
> I'm Ahmad Muhammad Wammi, building from Yobe. This is GigSure AI — built for Africa, starting with Nigeria.
>
> Thank you."

---

## VIDEO EDITING NOTES

### Clips to use (in order):

1. **Homepage video** (0:00–0:15): Landing page → "Six pillars" section
2. **Homepage video** (0:15–0:30): "From handshake to paid" 6-step grid
3. **Main demo video** (0:00–0:20): Dashboard with stat cards + Account Setup
4. **Main demo video** (0:20–0:55): Funding page → PayPal payment card → "How cross-border funding works" info box
5. **Main demo video** (0:55–1:30): AI Assistants → Project Risk Assistant → report with stat cards + table
6. **Main demo video** (1:30–2:00): Project Brief Helper → response with missing elements table
7. **Main demo video** (2:00–2:15): Quick cuts — dashboard → funding → AI
8. **Homepage video** (ending): Footer with tagline

### Recording tips:
- Record in landscape (16:9) at 1080p minimum
- Use screen recording software (OBS Studio, Loom, or Chrome's built-in screen recorder)
- Speak clearly, moderate pace — you have 3 minutes, not 1
- Show the actual live app at https://gigsure-ai.vercel.app/
- For the PayPal section, actually click the "Pay $33.33 with PayPal" button to show the sandbox opening
- For AI sections, actually type the prompt and wait for the response — it takes ~1 second on Groq

### What to show on screen:
- Full browser window (including URL bar so judges can see it's the real deployed app)
- Zoom in on tables/badges when discussing them
- Keep the sidebar visible so judges see the full feature set
