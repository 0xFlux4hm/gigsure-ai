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

# Run database migrations.
# SECURITY (2026-10): use `prisma migrate deploy` (applies migration files,
# never drops data without an explicit migration) instead of `db push`
# (dev-only, can silently drop columns/tables on schema drift).
echo "[entrypoint] Running database migrations…"
if [ -d "prisma/migrations" ]; then
    bunx prisma migrate deploy || {
        echo "[entrypoint] ❌ Database migration failed"
        exit 1
    }
else
    echo "[entrypoint] No migration files found — falling back to db push"
    echo "[entrypoint] ⚠️  WARNING: db push can silently drop data. Use prisma migrate dev to create migration files."
    bunx prisma db push --accept-data-loss || {
        echo "[entrypoint] ❌ Database schema push failed"
        exit 1
    }
fi

# Start the Next.js server (standalone build)
echo "[entrypoint] Starting Next.js server on port ${PORT:-3000}…"
exec node server.js
