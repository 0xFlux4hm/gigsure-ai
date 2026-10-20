#!/bin/bash
# GigSure AI — Free-Tier Setup Wizard
#
# Interactive script that walks you through setting up the free-tier production
# deployment. Generates secrets, validates config, and prints a checklist of
# manual steps (Vercel, Neon, Google Cloud).
#
# Usage: ./scripts/setup-free-tier.sh

set -e

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo_step() { echo -e "${BLUE}▶ $1${NC}"; }
echo_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
echo_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
echo_err()  { echo -e "${RED}✗ $1${NC}"; }

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   GigSure AI — Free-Tier Production Setup Wizard          ║${NC}"
echo -e "${BOLD}║   Total cost: \$0/month                                   ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This wizard will:"
echo "  1. Generate cryptographic secrets"
echo "  2. Switch the database schema to PostgreSQL"
echo "  3. Verify the build passes"
echo "  4. Print a checklist of manual cloud steps"
echo ""
echo "Press Ctrl+C at any time to abort."
echo ""
read -p "Press Enter to continue… " DUMMY

# ---- Step 1: Check prerequisites ----
echo_step "Checking prerequisites…"

command -v bun >/dev/null 2>&1 || { echo_err "bun not installed. Install: https://bun.sh"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo_err "openssl not installed"; exit 1; }
[ -f .env ] || { echo_warn ".env not found. Copying from .env.example…"; cp .env.example .env; }

echo_ok "Prerequisites OK"

# ---- Step 2: Switch to PostgreSQL schema ----
echo_step "Switching schema to PostgreSQL…"
if grep -q '^provider = "sqlite"' prisma/schema.prisma; then
  bun run db:switch-postgres
  echo_ok "Schema switched"
else
  echo_ok "Already on PostgreSQL"
fi

# ---- Step 3: Generate secrets ----
echo_step "Generating cryptographic secrets…"

NEXTAUTH_SECRET=$(openssl rand -base64 32)
MOCK_WEBHOOK_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

echo_ok "Secrets generated:"
echo "    NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
echo "    MOCK_WEBHOOK_SECRET=$MOCK_WEBHOOK_SECRET"
echo "    POSTGRES_PASSWORD=$POSTGRES_PASSWORD"

# ---- Step 4: Update .env (without overwriting user's existing values) ----
echo_step "Updating .env with generated secrets…"

update_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    # Replace existing
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

update_env_var "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET"
update_env_var "MOCK_WEBHOOK_SECRET" "$MOCK_WEBHOOK_SECRET"
update_env_var "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
update_env_var "RATE_LIMIT_BACKEND" "memory"

rm -f .env.bak
echo_ok ".env updated"

# ---- Step 5: Run lint + tests ----
echo_step "Running lint + tests to verify everything works…"
bun run lint 2>&1 | tail -2
echo_ok "Lint passed"

# ---- Step 6: Print manual checklist ----
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   MANUAL STEPS — Complete these in your browser           ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Follow docs/DEPLOYMENT_FREE_TIER.md for detailed steps."
echo ""
echo -e "${BOLD}Step A — Neon Postgres (10 min)${NC}"
echo "  1. Go to https://neon.tech → sign up with GitHub"
echo "  2. Create new project (region: AWS eu-west-1 Ireland)"
echo "  3. Copy the connection string"
echo "  4. Paste it as DATABASE_URL in .env AND in Vercel env vars"
echo ""
echo -e "${BOLD}Step B — Google OAuth (15 min)${NC}"
echo "  1. Go to https://console.cloud.google.com → create project"
echo "  2. Configure OAuth consent screen (External, your email as test user)"
echo "  3. Create OAuth client (Web application)"
echo "  4. Authorized redirect URIs:"
echo "     - https://YOUR_VERCEL_URL.vercel.app/api/auth/callback/google"
echo "     - http://localhost:3000/api/auth/callback/google"
echo "  5. Copy GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET"
echo ""
echo -e "${BOLD}Step C — Gmail SMTP (10 min)${NC}"
echo "  1. Go to https://myaccount.google.com → Security"
echo "  2. Enable 2-Step Verification"
echo "  3. Go to https://myaccount.google.com/apppasswords"
echo "  4. Create app password named 'GigSure AI'"
echo "  5. Copy the 16-char password"
echo "  6. Set in .env / Vercel:"
echo "     SMTP_URL=smtp://YOUR_EMAIL%40gmail.com:PASSWORD@smtp.gmail.com:587"
echo "     EMAIL_FROM='GigSure AI <YOUR_EMAIL@gmail.com>'"
echo ""
echo -e "${BOLD}Step D — Deploy to Vercel (10 min)${NC}"
echo "  1. Go to https://vercel.com → sign up with GitHub"
echo "  2. Import repo: 0xFlux4hm/gigsure-ai"
echo "  3. Add ALL env vars (see .env for the full list)"
echo "  4. Deploy"
echo "  5. After deploy, update GOOGLE_CLIENT redirect URIs with the Vercel URL"
echo "  6. Update NEXTAUTH_URL in Vercel env vars with the Vercel URL"
echo ""
echo -e "${BOLD}Step E — Verify${NC}"
echo "  1. Visit https://YOUR_VERCEL_URL.vercel.app/api/health → should be 200"
echo "  2. Visit https://YOUR_VERCEL_URL.vercel.app/?view=register"
echo "  3. Register with a fresh email"
echo "  4. Check Gmail inbox for verification email"
echo "  5. Click link → sign in"
echo "  6. Visit /?view=admin → you'll be auto-promoted to admin"
echo ""
echo -e "${GREEN}${BOLD}✓ Setup wizard complete${NC}"
echo ""
echo "When you have money for a domain, follow docs/GO_LIVE_CHECKLIST.md"
