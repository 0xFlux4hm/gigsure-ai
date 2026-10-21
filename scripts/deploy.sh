#!/bin/bash
# GigSure AI — Production deploy script
#
# Usage:
#   ./scripts/deploy.sh                  # Deploy current branch
#   ./scripts/deploy.sh --build          # Rebuild Docker images before deploy
#   ./scripts/deploy.sh --migrate-only   # Just run DB migrations (no app restart)
#
# Prerequisites:
#   - .env file with all required vars (NEXTAUTH_SECRET, DATABASE_URL, etc.)
#   - Docker + Docker Compose installed
#   - For Postgres: prisma/schema.prisma must be the postgres variant
#     (run: cp prisma/schema.postgres.prisma prisma/schema.prisma)
#
# What this script does:
#   1. Validates required env vars are set
#   2. Optionally rebuilds Docker images
#   3. Runs database migrations (idempotent)
#   4. Restarts the app container
#   5. Verifies the health endpoint responds 200

set -e

cd "$(dirname "$0")/.."

# Load env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

BUILD=false
MIGRATE_ONLY=false
for arg in "$@"; do
    case $arg in
        --build) BUILD=true ;;
        --migrate-only) MIGRATE_ONLY=true ;;
    esac
done

# Color helpers
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}
echo_ok() {
    echo -e "${GREEN}✓ $1${NC}"
}
echo_fail() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# ---- 1. Validate env vars ----
echo_step "Validating environment…"
REQUIRED_VARS=(DATABASE_URL NEXTAUTH_SECRET NEXTAUTH_URL)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        MISSING+=("$var")
    fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
    echo_fail "Missing required env vars: ${MISSING[*]}"
fi
echo_ok "All required env vars are set"

# ---- 2. Build (optional) ----
if [ "$BUILD" = true ]; then
    echo_step "Building Docker images…"
    docker compose build
    echo_ok "Images built"
fi

# ---- 3. Database migration ----
echo_step "Running database migrations…"
if [ "$MIGRATE_ONLY" = true ]; then
    # Run only migrations, no app restart
    docker compose run --rm --no-deps app bunx prisma db push --accept-data-loss
    echo_ok "Migrations complete (migrate-only mode)"
    exit 0
fi

# Normal: ensure postgres is up, then migrate via app container
docker compose up -d postgres
echo_ok "Postgres is up"

# Wait for postgres to be ready
echo_step "Waiting for Postgres to be ready…"
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U gigsure -d gigsure >/dev/null 2>&1; then
        echo_ok "Postgres ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo_fail "Postgres failed to become ready in 30 seconds"
    fi
    sleep 1
done

# Run migrations inside the app container (one-shot, not detached)
echo_step "Applying schema migrations…"
docker compose run --rm --no-deps app bunx prisma db push --accept-data-loss
echo_ok "Migrations applied"

# ---- 4. Start / restart the app ----
echo_step "Starting app…"
docker compose up -d app
echo_ok "App is up"

# ---- 5. Health check ----
echo_step "Waiting for app to become healthy…"
for i in {1..60}; do
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ]; then
        echo_ok "App is healthy (HTTP 200 on /api/health)"
        break
    fi
    if [ $i -eq 60 ]; then
        echo_fail "App failed to become healthy in 60 seconds (last status: $HEALTH)"
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deploy complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "App URL:    $NEXTAUTH_URL"
echo "Health:     $NEXTAUTH_URL/api/health"
echo "Admin:      $NEXTAUTH_URL/?view=admin"
echo ""
echo "Logs:       docker compose logs -f app"
echo "Stop:       docker compose down"
echo "Restart:    docker compose restart app"
