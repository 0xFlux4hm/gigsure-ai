# GigSure AI — Judge Testing Instructions

## Live Application
**URL:** https://gigsure-ai.vercel.app/

---

## Option 1: Google Login (Recommended — fastest)

1. Go to https://gigsure-ai.vercel.app/
2. Click **"Get started"** or **"Sign in"**
3. Click **"Continue with Google"**
4. Sign in with any Google account (Gmail, Workspace, etc.)
5. Review your profile info → accept the Terms of Service
6. You're in! You'll see the dashboard.

**No password needed. Google verifies your email automatically.**

---

## Option 2: Email + Password

1. Go to https://gigsure-ai.vercel.app/
2. Click **"Get started"**
3. Switch to the **"Register"** tab
4. Enter your email, name, and a password (min 8 characters)
5. Accept the Terms of Service
6. Click **"Create account"**
7. Check your email for a verification link (check spam folder)
8. Click the verification link
9. Log in with your email + password

---

## What to Test

### 1. Dashboard
- View stat cards (active projects, earnings, pending milestones)
- Account Setup checklist (KYC + bank account)

### 2. Create a Project
- Click **"New project"** (opens full-screen form on mobile, side sheet on desktop)
- Fill in title + description (min 10 characters)
- Select funding arrangement (Full / Milestone / Upfront + Milestones)
- Click **"Create project"**

### 3. AI Features (powered by Groq — 500 tokens/sec)
Inside any project, click the **"AI assistants"** tab:
- **Project Risk Assistant** — type "plan" → click "Run assistant" → see dashboard report with stat cards + severity badges + findings table
- **Project Brief Helper** — type "brief us about the projects" → see missing elements table
- **Team Planner** — type "Help me" → see suggested roles + collaboration structure
- **Milestone Helper** — asks about funding arrangement options
- **Dispute Helper** — explains dispute resolution process

On the **Milestones** tab:
- Click **"AI Generate"** button → AI suggests milestone breakdown with deliverables, acceptance criteria, and payment percentages

### 4. PayPal Cross-Border Payment
- Open a project → **Funding** tab
- See the **"Pay with PayPal"** card
- Shows USD conversion (e.g., ₦50,000 → $33.33 at 1 USD = ₦1,500)
- Click **"Pay $33.33 with PayPal"** → PayPal sandbox opens
- Use PayPal sandbox test credentials to complete payment:
  - **Buyer email:** test-buyer@example.com (or use any sandbox account)
  - The sandbox will show a test payment flow
- After payment, milestone status updates to "Funded"

### 5. Contract Versioning
- Open a project → **Contracts** tab
- Click **"New version"** → opens multi-step form (Edit → Review → Submit)
- Fill in scope of work, deliverables, deadlines, etc.
- Click **"Review"** → see full preview + diff against previous version
- Click **"Create version"**
- Click **"Analyze"** on any contract → AI contract analysis with risk score

### 6. Dispute Resolution
- Open a project → **Disputes** tab
- Click **"Open dispute"** → fill in title, category, description
- Open the dispute → click **"Generate neutral summary"**
- AI produces timeline, gaps, claims, and recommended next steps

---

## PayPal Sandbox Test Accounts

The PayPal sandbox is configured with test accounts. When you click "Pay with PayPal", the PayPal sandbox checkout will open. You can use these test credentials:

- **Sandbox Buyer Email:** (use the sandbox account from developer.paypal.com)
- **Sandbox Buyer Password:** (use the sandbox account password)

If you don't have PayPal sandbox credentials, the payment flow still demonstrates:
- USD→NGN conversion
- The "Pay with PayPal" button
- The funding card UI
- The "How cross-border funding works" explanation

---

## Technical Notes

- **AI Provider:** Groq (openai/gpt-oss-20b) — 500+ tokens/sec on LPU hardware
- **PayPal:** Sandbox environment (api-m.sandbox.paypal.com) — no real money
- **All AI features are advisory only** — the AI never authorizes payments or makes binding decisions
- **Rate limit:** 20 AI calls per hour per user (Groq free tier: 30 RPM)
- **If AI returns "rate limit exceeded":** wait 60 seconds and try again

---

## Questions?

Contact: Ahmad Muhammad Wammi (0xFlux4hm)
GitHub: https://github.com/0xFlux4hm/gigsure-ai
