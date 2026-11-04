# GigSure AI — Judge Testing Instructions

## Live Application
**URL:** https://gigsure-ai.vercel.app/

---

## Test Accounts

Two pre-verified accounts are available for judges:

| Account | Email | Password | Role |
|---------|-------|----------|------|
| **Judge 1** | judge1@gigsure.ai | GigSure2026! | Project owner / client |
| **Judge 2** | judge2@gigsure.ai | GigSure2026! | Collaborator / freelancer |

**To log in:**
1. Go to https://gigsure-ai.vercel.app/
2. Click **"Sign in"**
3. Enter the email and password above
4. Click **"Sign in"**

Alternatively, judges can sign in with any Google account (click "Continue with Google").

---

## What to Test

### 1. Dashboard
- View stat cards (active projects, earnings, pending milestones)
- Account Setup checklist (KYC + bank account)

### 2. Create a Project
- Click **"New project"** (opens full-screen form on mobile, side sheet on desktop)
- Fill in title (min 3 characters) + description (min 10 characters)
- Select funding arrangement (Full / Milestone / Upfront + Milestones)
- Click **"Create project"**

### 3. AI Features (powered by Groq — 500 tokens/sec)
Inside any project, click the **"AI assistants"** tab:
- **Project Risk Assistant** — type "plan" → click "Run assistant" → see dashboard report with stat cards, severity badges, findings table
- **Project Brief Helper** — type "brief us about the projects" → see missing elements table
- **Team Planner** — type "Help me" → see suggested roles + collaboration structure

On the **Milestones** tab:
- Click **"AI Generate"** button → AI suggests milestone breakdown with deliverables, acceptance criteria, and payment percentages

### 4. PayPal Cross-Border Payment
- Open a project → **Funding** tab
- See the **"Pay with PayPal"** card
- Shows USD conversion (e.g., ₦50,000 → $33.33 at 1 USD = ₦1,500)
- Click **"Pay $33.33 with PayPal"** → PayPal sandbox opens
- Complete the sandbox payment
- Milestone status updates to "Funded"

### 5. Contract Versioning
- Open a project → **Contracts** tab
- Click **"New version"** → multi-step form (Edit → Review → Submit)
- Fill in scope of work, deliverables, deadlines
- Click **"Review"** → see full preview + diff
- Click **"Create version"**
- Click **"Analyze"** on any contract → AI contract analysis with risk score and dashboard report

### 6. Dispute Resolution
- Open a project → **Disputes** tab
- Click **"Open dispute"** → fill in title, category, description
- Open the dispute → click **"Generate neutral summary"**
- AI produces timeline, gaps, claims, and recommended next steps

---

## PayPal Sandbox

The PayPal sandbox is configured. When you click "Pay with PayPal", the PayPal sandbox checkout will open in a new tab. You can complete the test payment using any PayPal sandbox buyer account.

If you don't have a PayPal sandbox account, the payment flow still demonstrates:
- USD → NGN conversion
- The "Pay with PayPal" button and funding card UI
- The "How cross-border funding works" explanation

---

## Technical Notes

- **AI Provider:** Groq (openai/gpt-oss-20b) — 500+ tokens/sec on LPU hardware
- **PayPal:** Sandbox environment (api-m.sandbox.paypal.com) — no real money moves
- **All AI features are advisory only** — the AI never authorises payments or makes binding decisions
- **Rate limit:** 20 AI calls per hour per user (Groq free tier: 30 RPM)
- **If AI returns "rate limit exceeded":** wait 60 seconds and try again

---

## Questions?

Contact: Ahmad Muhammad Wammi (0xFlux4hm)
GitHub: https://github.com/0xFlux4hm/gigsure-ai
