# GigSure AI — Free Tier Deployment Guide

> **Goal**: Deploy GigSure AI to production for **$0/month**. When you have money for a domain (~$10/year), you can attach it in 5 minutes — no code changes needed.

## Cost projection

| Service | Free tier limit | When you'd outgrow it | Paid alternative |
|---------|----------------|----------------------|------------------|
| **Vercel** (hosting) | 100 GB bandwidth / month, 100 hrs serverless / month | ~10k MAUs | $20/mo Pro |
| **Neon** (Postgres) | 0.5 GB storage, 100 compute hours / month | ~5k users | $19/mo Launch |
| **Gmail SMTP** (emails) | 500 / day via your Gmail account | >500 verifications/day | Resend $20/mo |
| **Google OAuth** | Unlimited | — | (free forever) |
| **GitHub Actions** | 2000 min/month for private repos; unlimited for public | rarely | $4/mo Pro |
| **Cloudflare** (DNS + CDN, optional) | Unlimited | — | (free forever) |
| **Domain** (when you have money) | — | — | ~$10/year |

**Total before you buy a domain: $0/month.**
**After you buy a domain: ~$10/year (just the domain).**

---

## Architecture (all free tier)

```
┌─────────────────────────────────────────────────────────────┐
│                       Your browser                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  gigsure-ai.vercel.app  (free Vercel subdomain)             │
│  • Next.js app (auto-deployed from GitHub on every push)    │
│  • Security headers middleware                              │
│  • Rate limiting (in-memory, single-instance)               │
└─────────┬───────────────────────────────────┬──────────────┘
          │                                   │
          ▼                                   ▼
┌─────────────────────┐                ┌─────────────────────┐
│  Neon Postgres      │                │  Gmail SMTP        │
│  (free 0.5 GB)     │                │  (via your Gmail)   │
└─────────────────────┘                └─────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│  External providers                                         │
│  • Google OAuth (accounts.google.com) — free                │
│  • z-ai-web-dev-sdk (AI provider) — uses ZAI_API_KEY       │
│  • Mock payment provider — disabled in production           │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-step setup (90 minutes total)

### Prerequisites

- A GitHub account (you already have one)
- A Google account (for OAuth + email)
- 90 minutes of focused time

### Step 1 — Switch to PostgreSQL schema (2 minutes)

```bash
cd /home/z/my-project
bun run db:switch-postgres
# This copies prisma/schema.postgres.prisma over prisma/schema.prisma
# Confirms: "✓ Switched to PostgreSQL schema. Run bun run db:push to apply."
```

Commit + push this change so Vercel builds against Postgres:

```bash
git add prisma/schema.prisma
git commit -m "chore: switch to PostgreSQL schema for production"
git push
```

### Step 2 — Create Neon Postgres database (10 minutes)

1. Go to https://neon.tech
2. Sign up with your GitHub account (free, no credit card)
3. Click **New Project**
4. Settings:
   - **Name**: `gigsure-ai`
   - **Region**: closest to your users (e.g., `AWS ap-south-1 (Mumbai)` if you're in Nigeria — actually pick `AWS eu-west-1 (Ireland)` for best latency to Nigeria)
   - **Postgres version**: 16 (latest)
   - **Branch**: `main`
5. Click **Create Project**
6. On the project dashboard, click **Connect** → copy the **Connection string**
   - Looks like: `postgresql://gigsure_owner:password@ep-xxx.eu-west-1.aws.neon.tech/gigsure?sslmode=require`
7. Save it — you'll paste this into Vercel in Step 4

### Step 3 — Set up Google OAuth (15 minutes)

1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click **Select a project** → **NEW PROJECT**
   - Project name: `GigSure AI`
   - Click **Create**
4. From the hamburger menu, go to **APIs & Services** → **OAuth consent screen**
   - User type: **External**
   - App name: `GigSure AI`
   - User support email: your email
   - Developer contact email: your email
   - Skip the rest, click **Save and Continue** through each step
   - On **Test users** step, add your own email
   - Click **Save and Continue**
5. From the menu, go to **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `GigSure AI Production`
   - **Authorized JavaScript origins**: leave empty for now
   - **Authorized redirect URIs**: add these two (replace with your Vercel URL once you have it — for now, leave a placeholder):
     - `https://gigsure-ai.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google` (for local dev)
   - Click **Create**
6. A modal will show your **Client ID** and **Client Secret**. Copy both.

### Step 4 — Deploy to Vercel (10 minutes)

1. Go to https://vercel.com
2. Sign up with your GitHub account (free, no credit card)
3. Click **Add New** → **Project**
4. Import your GitHub repo: `0xFlux4hm/gigsure-ai`
5. Vercel auto-detects Next.js. Don't click Deploy yet — configure environment variables first.
6. Expand **Environment Variables** and add each of these (use the values from Steps 2-3):

   | Name | Value | Environments |
   |------|-------|--------------|
   | `DATABASE_URL` | `postgresql://gigsure_owner:xxx@ep-xxx.neon.tech/gigsure?sslmode=require` | Production, Preview, Development |
   | `NEXTAUTH_SECRET` | Generate with: `openssl rand -base64 32` (run this in your terminal, paste result) | Production only |
   | `NEXTAUTH_URL` | `https://gigsure-ai.vercel.app` (replace with actual Vercel URL after first deploy) | Production |
   | `GOOGLE_CLIENT_ID` | your-client-id.apps.googleusercontent.com | Production, Preview, Development |
   | `GOOGLE_CLIENT_SECRET` | your-google-client-secret | Production, Preview, Development |
   | `MOCK_WEBHOOK_SECRET` | Generate with: `openssl rand -hex 32` | Production, Preview |
   | `ADMIN_EMAILS` | your.email@gmail.com (lowercase) | Production |
   | `EMAIL_FROM` | `GigSure AI <your.email@gmail.com>` | Production |
   | `SMTP_URL` | `smtp://your.email%40gmail.com:your-gmail-app-password@smtp.gmail.com:587` (see Step 5) | Production |
   | `ZAI_API_KEY` | (your Z.ai API key — if you have one; otherwise leave empty, fallback works) | Production |

7. Click **Deploy**
8. Wait ~3 minutes for the build to complete
9. You'll get a URL like `https://gigsure-ai.vercel.app` (or a different name if taken)

### Step 5 — Set up Gmail SMTP (10 minutes)

This lets the app send verification + password reset emails using your Gmail account. No domain needed.

1. Go to https://myaccount.google.com
2. Sign in with the Gmail account you want to use as the sender
3. Go to **Security** → enable **2-Step Verification** if not already on
4. Go to https://myaccount.google.com/apppasswords
5. Create a new app password:
   - App name: `GigSure AI`
   - Click **Create**
   - Copy the 16-character password that appears (looks like `abcd efgh ijkl mnop`)
6. Construct your SMTP_URL:
   - Replace `@` in your email with `%40`
   - Format: `smtp://YOUR_EMAIL%40gmail.com:YOUR_APP_PASSWORD@smtp.gmail.com:587`
   - Example: `smtp://founder%40gmail.com:abcd-efgh-ijkl-mnop@smtp.gmail.com:587`
7. Add this to Vercel env vars (as `SMTP_URL` — see Step 4)

> **Why Gmail SMTP?** Gmail's free SMTP allows 500 emails/day per account. For a new app, that's way more than enough. You won't outgrow this until you have hundreds of new signups per day.

### Step 6 — Update Google OAuth redirect URIs (5 minutes)

1. Go back to Google Cloud Console → Credentials → your OAuth client
2. Click **Edit**
3. Update **Authorized redirect URIs** to include:
   - `https://gigsure-ai.vercel.app/api/auth/callback/google` (replace with your actual Vercel URL)
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
4. Click **Save**

### Step 7 — Verify deployment (5 minutes)

1. Visit your Vercel URL: `https://gigsure-ai.vercel.app`
2. Click **Get Started** → register a new account with your real email
3. Check your Gmail inbox for a verification email (this confirms SMTP works)
4. Click the verification link → sign in
5. You're now in the dashboard!

6. Test health check: visit `https://gigsure-ai.vercel.app/api/health` — should return:
   ```json
   {"status":"healthy","timestamp":"...","version":"0.2.1","environment":"production","checks":{"database":{"ok":true,"latencyMs":...}}}
   ```

7. To make yourself admin: you set `ADMIN_EMAILS=your.email@gmail.com` in Step 4. On your first visit to `/?view=admin`, you'll be auto-promoted.

### Step 8 — Reset dev DB before going live (1 minute)

You don't want the test users (`fresh.user3@example.com` etc.) in your production DB. Since Neon is a separate DB, you don't actually need to reset — but you should make sure no test data leaks. The Neon DB starts empty, so you're good.

If you ever need to wipe Neon:
```bash
# Get your Neon connection string from .env or Vercel
DATABASE_URL="postgresql://..." bunx prisma migrate reset --force
```

---

## What's now live

- ✅ App accessible at `https://gigsure-ai.vercel.app`
- ✅ Postgres database on Neon
- ✅ Email verification + password resets via Gmail SMTP
- ✅ Google OAuth (real, not demo)
- ✅ HTTPS (Vercel auto-provisions Let's Encrypt certs)
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Rate limiting on login + AI endpoints
- ✅ Admin dashboard at `/?view=admin`
- ✅ AI assistants (if ZAI_API_KEY is set)
- ✅ Mock payment provider (clearly labelled SIMULATED)

## Limitations of the free tier

1. **Vercel cold starts**: First request after 15 min idle takes ~1-2s. Subsequent requests are fast.
2. **Neon auto-suspend**: DB compute suspends after 5 min of no activity. First query takes ~1s to wake up.
3. **Rate limiter is in-memory**: Works for single-instance Vercel deployments. If you scale beyond that, you'd need Redis.
4. **Single Gmail SMTP**: All emails come from your Gmail address. Doesn't look as professional as `noreply@gigsure.ai`. Fine for beta.
5. **No real payments**: Mock provider only. Users can see the funding flow but no real money moves.
6. **No domain**: URL is `gigsure-ai.vercel.app`. A bit ugly but fully functional.

---

## When you have money — go-live checklist

See `docs/GO_LIVE_CHECKLIST.md` for the complete "money arrived, now what" guide. Short version:

1. **Buy a domain** (~$10/year on Namecheap or Cloudflare)
2. **Add domain to Vercel** (free, takes 2 minutes, auto-HTTPS)
3. **Update DNS** at your domain registrar (point A record to Vercel)
4. **Update Google OAuth redirect URIs** with new domain
5. **Update Vercel env vars**: `NEXTAUTH_URL`, `EMAIL_FROM`
6. **Optional: switch to Resend** for better email deliverability ($20/mo, uses your domain)
7. **Optional: register CAC** for business → apply for Paystack
8. **Push to GitHub** → Vercel auto-redeploys

Total time: 30 minutes. Total new cost: ~$10/year (domain).

---

## Monitoring (free)

- **Vercel dashboard**: shows deploys, logs, analytics (free)
- **Neon dashboard**: shows DB usage, queries, branches (free)
- **Gmail inbox**: monitor bounce notifications
- **GitHub Actions**: CI status on every push
- **Health check**: `https://gigsure-ai.vercel.app/api/health`

---

## Troubleshooting

**Build fails on Vercel** — check the build logs. Most common: missing env var. Make sure you added ALL of them in Step 4.

**Login redirects to demo Google flow** — your `GOOGLE_CLIENT_ID` is missing or starts with `demo_`. Verify it's set correctly in Vercel env vars.

**Database connection fails** — verify `DATABASE_URL` is the Neon connection string with `?sslmode=require` at the end. Neon requires SSL.

**Emails don't arrive** — check Gmail SMTP app password is correct. Look in Vercel function logs for SMTP errors.

**"Administrator access required"** — make sure your email is in `ADMIN_EMAILS` env var (lowercase, comma-separated if multiple).

**Health check returns 503** — database connection failed. Verify `DATABASE_URL` is correct.
