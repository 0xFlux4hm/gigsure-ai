# GigSure AI — 3-Minute Demo Video Script

**Hackathon:** PayPal AI Hackathon (Devpost)
**Track:** Open (targeting Best Use of PayPal + AI, Best Use of Agentic Commerce, Most Impactful)
**Length:** 3:00 (strict — judges only watch the first 3 minutes)

---

## Recording Notes

- **Tool:** Phone screen recorder (iOS Screen Recording or Android screen recorder)
- **Voiceover:** Record separately using phone's voice memos app, then merge in CapCut (free)
- **Resolution:** 1080p minimum, landscape preferred
- **Audio:** Quiet room, speak clearly, no background music during the demo
- **Pacing:** Aim for ~120-140 words per minute (conversational but not rushed)

---

## Script

### 0:00 — 0:20 · The Problem (Hook)

**[Visual: Ahmad's face to camera, or a title card with the GigSure AI logo]**

> "I'm Ahmad, a cybersecurity bug hunter based in Lagos, Nigeria. Every freelancer I know has been burned by the same thing: vague contracts, unpaid milestones, and 'he said, she said' disputes with no paper trail.
>
> Existing platforms like Upwork were built for Western, text-first, Stripe-paid work. They don't fit our market — where most communication happens via WhatsApp, payments run through local rails, and most freelancers can't afford a lawyer to review a contract.
>
> So I built GigSure AI — trust infrastructure for Africa's independent services market."

**[Visual: Cut to the GigSure AI dashboard at gigsure-ai.vercel.app]**

---

### 0:20 — 1:10 · AI Contract Risk Score (Wow Moment #1)

**[Visual: Open a project → click Contracts → expand a contract version]**

> "Here's the feature I'm most proud of. When a freelancer opens a contract, they can't always tell if the terms are fair. So I built an AI Contract Risk Analyzer.
>
> Watch this — I click 'Analyze risks'..."

**[Visual: Click "Analyze risks" button → loading spinner → risk score appears]**

> "...and the AI returns a risk score from 0 to 100, with specific clause flags.
>
> This contract scored 73 out of 100 — high risk. The AI flagged three issues: unlimited liability, no specific payment deadline, and ambiguous IP ownership. For each one, it gives a recommendation on what to negotiate.
>
> This is powered by Z.AI's GLM model, and it runs entirely on the free tier — zero cost per analysis. No Nigerian freelancer can afford a lawyer to review a 50,000 naira contract. Now they don't have to."

**[Visual: Scroll through the flagged clauses + recommendations]**

---

### 1:10 — 2:15 · PayPal Cross-Border Funding (Wow Moment #2)

**[Visual: Click "Funding" tab → scroll to the PayPal card]**

> "Now, the centerpiece for this hackathon. GigSure already supports Nigerian payment rails — Monnify and OPay — for local escrow. But what happens when an international client wants to hire a Nigerian freelancer?
>
> I added PayPal for cross-border funding. Watch..."

**[Visual: Select a milestone → see USD conversion → click "Pay with PayPal"]**

> "This milestone is 450,000 naira. The platform converts it to 300 US dollars at the current rate. I click 'Pay with PayPal'..."

**[Visual: PayPal sandbox opens in a new tab → login with test account → approve payment]**

> "...PayPal sandbox opens. I log in with a test buyer account and approve the payment. PayPal processes it in USD..."

**[Visual: Switch back to GigSure → milestone status updates to "Funded"]**

> "...the webhook fires back to GigSure, the funds are confirmed in escrow, and the milestone status updates to 'Funded'.
>
> The freelancer will receive naira via Monnify or OPay when the milestone is complete. Cross-border payments, handled."

**[Visual: Show the funding record in the transaction history with provider: "paypal"]**

---

### 2:15 — 2:45 · AI Assistant + The Agentic Commerce Story

**[Visual: Click "AI assistants" tab → select the Funding Assistant]**

> "Underneath all of this are seven AI assistants — one for each step of the project lifecycle. Let me ask the Funding Assistant about the transaction we just made..."

**[Visual: Type "Summarize this project's funding status" → click "Run assistant" → AI responds]**

> "...and the AI summarizes the cross-border flow, confirms the escrow is held, and notes the next step.
>
> This is agentic commerce — AI agents that understand the project context, the payment state, and the contract terms, and can advise on next steps. Not just a chatbot — a domain-aware assistant."

**[Visual: Show the AI response briefly]**

---

### 2:45 — 3:00 · The Ask + Wrap

**[Visual: Cut back to Ahmad, or a closing title card]**

> "GigSure AI: cross-border escrow via PayPal, AI agents for every project step, and a contract risk analyzer that gives every freelancer the lawyer they can't afford. Built for Africa's independent services market, starting in Nigeria.
>
> I'm Ahmad Muhammad Wammi, building from Lagos. The repo is open source — link in the description. Thank you."

**[Visual: Final card with GigSure AI logo + "github.com/0xFlux4hm/gigsure-ai"]**

---

## What to Prepare Before Recording

1. **A test contract with realistic content** — at least 500 words of scope, payment schedule, deadlines. The AI needs enough text to analyze. Pre-fill this in your demo project before recording.

2. **A test milestone in AWAITING_FUNDING status** — so the PayPal card shows it in the dropdown.

3. **The PayPal sandbox buyer account credentials handy** — email + password from your PayPal developer dashboard. You'll need to log in during the demo.

4. **A clean browser session** — log out, clear cache, log back in fresh so there's no clutter.

5. **Stable internet** — the PayPal sandbox + webhook round-trip needs to work smoothly.

---

## What Makes This Script Win

1. **Two clear "wow moments" at 0:30 and 1:30** — the AI Contract Risk Score and the PayPal cross-border flow. Judges remember these.

2. **The "lawyer they can't afford" line** — emotionally resonant, ties the AI feature to a real human need.

3. **The agentic commerce angle is explicit** — directly targets the "Best Use of Agentic Commerce" prize ($5k).

4. **The cross-border story is clear** — international client pays USD, freelancer receives NGN. No Western platform does this.

5. **The ask is sharp** — 15 seconds, ends on the founder's name + location + repo link.

6. **The total cost is $0** — free Z.AI model, free PayPal sandbox, free Vercel. Worth mentioning if a judge asks about scalability.

---

## Demo Recording Tips

- **Do 3-5 takes.** The first take is always bad. The third or fourth is usually the keeper.
- **Smile when you say the founder's name.** It sounds warmer.
- **Don't read the script verbatim.** Use it as a guide. Natural speech is more convincing.
- **If you stumble, restart the sentence.** Don't say "um" or "sorry."
- **Show your hands on the keyboard briefly** — it makes the demo feel live, not pre-recorded.
- **End with the repo URL visible** for at least 3 seconds — judges need time to write it down or click.

---

## Alternative Openings (if you want a different tone)

### Option B — Problem-first (more emotional)

> "Last year, my friend Tunde — a graphic designer in Lagos — completed a logo project for a client in the US. The client paid via PayPal. By the time Tunde withdrew the money, FX depreciation had eaten 12% of his fee. When the client requested revisions beyond the agreed scope, Tunde had no contract clause to push back. He lost two weeks of unpaid work.
>
> I built GigSure AI so this stops happening."

### Option C — Tech-first (more clinical)

> "GigSure AI is a freelance collaboration platform that combines PayPal cross-border escrow with seven AI agents and a contract risk analyzer. The stack: Next.js 16, Prisma, PostgreSQL, Z.AI's GLM model, and PayPal's Orders API v2.
>
> Let me show you how it works."

**My recommendation: Option A (the script above). It balances emotion, story, and demo.**
