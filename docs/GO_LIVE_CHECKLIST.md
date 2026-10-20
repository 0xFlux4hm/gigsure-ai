# GigSure AI — Go-Live Checklist

> **When to use this**: you've been running GigSure AI on the free tier (Vercel + Neon + Gmail SMTP) and you now have money to spend. This checklist walks you through every upgrade path, in priority order.

---

## Tier 1 — Buy a domain (~$10/year, 30 minutes)

**When to do this**: as soon as you have any budget. The single biggest credibility boost.

### Where to buy

| Registrar | Price (.com) | Notes |
|-----------|--------------|-------|
| **Cloudflare** | $9.77/yr | At-cost pricing, free WHOIS privacy, free DNS |
| **Namecheap** | $9.58/yr | Cheap, good UI, free WHOIS for 1st year |
| **Porkbun** | $9.13/yr | Cheapest, free WHOIS, friendly UI |

**Recommendation**: Cloudflare (best DNS, free forever).

### Recommended domains

- `gigsure.ai` (premium TLD, ~$70/year — skip if budget is tight)
- `gigsureai.com` (~$10/year)
- `gigsureai.ng` (~$30/year, Nigerian TLD — better for local market trust)
- `gigsure.app` (~$15/year)
- `getgigsure.com` (~$10/year)

### Steps after buying

1. **Add domain to Vercel**:
   - Go to your Vercel project → **Settings** → **Domains**
   - Add your domain (e.g., `gigsureai.com`)
   - Vercel shows you DNS records to add

2. **Configure DNS at Cloudflare/Namecheap**:
   - Add an **A record** pointing `@` to `76.76.21.21` (Vercel's IP)
   - Add a **CNAME record** pointing `www` to `cname.vercel-dns.com`
   - Wait 5-30 minutes for DNS propagation

3. **Update Google OAuth**:
   - Go to Google Cloud Console → Credentials → your OAuth client
   - Add `https://gigsureai.com/api/auth/callback/google` to authorized redirect URIs
   - Update OAuth consent screen **Authorized domains** to include `gigsureai.com`

4. **Update Vercel env vars**:
   - `NEXTAUTH_URL` → `https://gigsureai.com`
   - `EMAIL_FROM` → `GigSure AI <noreply@gigsureai.com>` (only after you set up Resend — Gmail SMTP can't send from your domain)

5. **Push to GitHub** — Vercel auto-redeploys with the new env vars

6. **Verify**:
   - Visit `https://gigsureai.com` — should load
   - Visit `https://gigsureai.com/api/health` — should return healthy
   - Try registering with a fresh email
   - Try Google OAuth sign-in

---

## Tier 2 — Switch to Resend for email ($20/month, 10 minutes)

**When to do this**: when you have a domain and want emails from `noreply@gigsureai.com` instead of your Gmail address. Big credibility boost. Also gives you analytics (bounces, opens, clicks).

### Why Resend

- 3000 emails/month free (with domain verification)
- $20/month for 50,000 emails
- Modern API, great devex
- Better deliverability than Gmail SMTP

### Setup

1. Go to https://resend.com → sign up with GitHub
2. **Add your domain**: follow the DNS verification steps (adds DKIM + SPF records to your DNS)
3. **Create API key**: copy the `re_xxx` key
4. **Update Vercel env vars**:
   - `SMTP_URL` → `smtp://resend:re_xxx@smtp.resend.com:465`
   - `EMAIL_FROM` → `GigSure AI <noreply@gigsureai.com>`
5. Push to GitHub — auto-redeploy
6. Test: register a fresh user, verify email arrives from `noreply@gigsureai.com`

---

## Tier 3 — Upgrade Vercel to Pro ($20/month, instant)

**When to do this**: when you hit Vercel free tier limits.

### Free tier limits you'll hit

- 100 GB bandwidth/month
- 100 serverless function hours/month
- 1 GB build cache
- No team collaboration features

### How to know you've outgrown free tier

- Vercel sends you an email when you hit 75% of limit
- You see "Rate Limit Exceeded" errors in logs
- Build times get slow due to cache evictions

### Upgrade path

1. Go to Vercel → **Settings** → **Billing**
2. Add a credit card
3. Click **Upgrade to Pro**
4. Done — limits instantly raised

---

## Tier 4 — Upgrade Neon to Launch ($19/month, instant)

**When to do this**: when you hit Neon free tier limits.

### Free tier limits

- 0.5 GB storage (good for ~5k users)
- 100 compute hours/month (good for low traffic)
- 1 project, 1 branch

### How to know you've outgrown free tier

- Neon dashboard shows storage approaching 0.5 GB
- You see "compute hour limit reached" errors

### Upgrade path

1. Go to Neon dashboard → **Billing**
2. Add a credit card
3. Click **Upgrade to Launch plan**
4. Storage limit goes to 10 GB, compute to unlimited

---

## Tier 5 — Real payments (costs vary, takes weeks)

**When to do this**: when you have a registered business and want real money to flow.

### Prerequisites (cannot skip)

1. **Register a business with CAC** (Corporate Affairs Commission)
   - Sole proprietorship: ~₦15,000 (~$20)
   - Limited liability company: ~₦50,000 (~$70) + lawyer fees
   - Takes 2-4 weeks
   - Required for any payment provider merchant account

2. **Open a Nigerian business bank account**
   - Requires CAC registration
   - Bank: GTBank, Access Bank, Zenith, First Bank — all work with Paystack/Flutterwave

3. **Choose payment provider**:
   - **Paystack**: most popular, 1.5% per transaction, CBN-licensed PSP
   - **Flutterwave**: similar, more African country support
   - Both require KYC + business verification (1-2 weeks)

### Integration (after prerequisites)

1. Get Paystack test keys (free, instant): https://dashboard.paystack.com
2. Implement real provider adapter (follow `docs/PAYMENT_INTEGRATION.md`)
3. Set env vars:
   ```
   PAYSTACK_SECRET_KEY=sk_test_xxx
   PAYSTACK_WEBHOOK_SECRET=whsec_xxx
   ```
4. Add webhook URL to Paystack dashboard: `https://gigsureai.com/api/payments/webhook`
5. Test with test cards (free): `4084 0840 8408 4081`
6. Switch to live keys after successful test
7. First real transaction: small amount (₦100) to verify

**Important**: Even with real Paystack integration, GigSure AI does NOT hold funds. Money flows directly between client → Paystack → freelancer's bank account. GigSure AI only records the transaction status.

---

## Tier 6 — Legal + compliance (costs vary, takes months)

**When to do this**: before scaling beyond friends-and-family beta.

### Required

1. **Terms of Service** — drafted by Nigerian counsel (~$500-2000)
2. **Privacy Notice** — drafted by Nigerian counsel (~$500-2000)
3. **NDPC registration** (if processing >1000 users' data) — ₦100,000 (~$150)
4. **Data Processing Agreement** with each sub-processor (Vercel, Neon, Resend, Google, Paystack) — templates are free, legal review ~$500

### Recommended

5. **DPIA** (Data Protection Impact Assessment) — self-service template at https://ndpc.gov.ng
6. **Cyber insurance** — ~$500/year for small startups
7. **Incident response plan** — template available free at https://www.sans.org/incident-response/

### Sources

- NDPA full text: https://ndpc.gov.ng/wp-content/uploads/2023/06/NDPA-2023.pdf
- NDPC official site: https://ndpc.gov.ng
- CBN regulations: https://www.cbn.gov.ng

---

## Monthly cost projection

| Tier | What you get | Monthly cost |
|------|--------------|--------------|
| Free | Vercel + Neon + Gmail SMTP, no domain | **$0** |
| Tier 1 | + Your own domain | **~$0.83** ($10/year ÷ 12) |
| Tier 2 | + Resend for branded email | **$20.83** |
| Tier 3 | + Vercel Pro | **$40.83** |
| Tier 4 | + Neon Launch | **$59.83** |
| Tier 5 | + Real payments (CAC + Paystack) | **$60+** (one-time ~$70 for CAC) |
| Tier 6 | + Legal review + NDPC | **$560+** (mostly one-time) |

**Realistic production-ready budget**: $60/month + ~$70 one-time for CAC = ~$70/mo ongoing.

---

## Status tracking

Print this checklist and tick items as you complete them:

```
[ ] Tier 1.1: Buy domain
[ ] Tier 1.2: Add to Vercel
[ ] Tier 1.3: Configure DNS
[ ] Tier 1.4: Update Google OAuth redirect URIs
[ ] Tier 1.5: Update NEXTAUTH_URL env var
[ ] Tier 1.6: Verify site loads on new domain

[ ] Tier 2.1: Sign up for Resend
[ ] Tier 2.2: Add + verify domain
[ ] Tier 2.3: Update SMTP_URL env var
[ ] Tier 2.4: Update EMAIL_FROM env var
[ ] Tier 2.5: Verify emails arrive from new domain

[ ] Tier 3.1: Upgrade Vercel to Pro (if hitting limits)

[ ] Tier 4.1: Upgrade Neon to Launch (if hitting limits)

[ ] Tier 5.1: Register business with CAC
[ ] Tier 5.2: Open business bank account
[ ] Tier 5.3: Apply for Paystack/Flutterwave
[ ] Tier 5.4: Get test keys
[ ] Tier 5.5: Implement real provider adapter
[ ] Tier 5.6: Configure webhook URL
[ ] Tier 5.7: Test with test cards
[ ] Tier 5.8: Switch to live keys
[ ] Tier 5.9: First real transaction verified

[ ] Tier 6.1: Engage Nigerian counsel for ToS
[ ] Tier 6.2: Engage Nigerian counsel for Privacy Notice
[ ] Tier 6.3: NDPC registration (if scale requires)
[ ] Tier 6.4: DPIA completed
[ ] Tier 6.5: DPAs signed with each sub-processor
[ ] Tier 6.6: Incident response plan documented
```
