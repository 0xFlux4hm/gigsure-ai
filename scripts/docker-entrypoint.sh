#!/bin/bash
# GigSure AI — Docker entrypoint
#
# Runs database migrations before starting the app.
# Exits if migrations fail (fail-fast).

set -e

echo "[entrypoint] GigSure AI starting up…"
echo "[entrypoint] Node version: $(node --version)"
echo "[entrypoint] Working directory: $(pwd)"

# Verify required env vars
if [ -z "$DATABASE_URL" ]; then
    echo "[entrypoint] ❌ DATABASE_URL is not set"
    exit 1
fi
if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "[entrypoint] ❌ NEXTAUTH_SECRET is not set"
    exit 1
fi
if [ -z "$NEXTAUTH_URL" ]; then
    echo "[entrypoint] ❌ NEXTAUTH_URL is not set"
    exit 1
fi

# Run database migrations (idempotent — safe to run on every restart)
echo "[entrypoint] Running database migrations…"
bunx prisma db push --accept-data-loss || {
    echo "[entrypoint] ❌ Database migration failed"
    exit 1
}

# Start the Next.js server (standalone build)
echo "[entrypoint] Starting Next.js server on port ${PORT:-3000}…"
exec node server.js
