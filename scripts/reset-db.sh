#!/bin/bash
# GigSure AI — Database reset script
#
# Wipes ALL data from the database and re-applies the schema.
# Use this BEFORE going to production to clear test/dummy data.
#
# Usage:
#   ./scripts/reset-db.sh             # Reset current DB (uses .env DATABASE_URL)
#   ./scripts/reset-db.sh --force     # Skip confirmation prompt
#
# WARNING: This is destructive. All user accounts, projects, contracts, funding
# records, disputes, and audit logs will be permanently deleted.

set -e

cd "$(dirname "$0")/.."

# Load env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

FORCE=false
if [ "$1" = "--force" ]; then
    FORCE=true
fi

if [ "$FORCE" = false ]; then
    echo "⚠️  This will PERMANENTLY DELETE all data in:"
    echo "    DATABASE_URL=${DATABASE_URL:-<not set>}"
    echo ""
    echo "This includes:"
    echo "  - All user accounts + password hashes"
    echo "  - All projects, contracts, milestones, funding records"
    echo "  - All disputes, evidence, audit logs"
    echo ""
    read -p "Type 'DELETE EVERYTHING' to confirm: " CONFIRM
    if [ "$CONFIRM" != "DELETE EVERYTHING" ]; then
        echo "Aborted."
        exit 1
    fi
fi

echo "Resetting database…"

# For SQLite: delete the file
if [[ "$DATABASE_URL" == file:* ]]; then
    DB_PATH="${DATABASE_URL#file:}"
    if [ -f "$DB_PATH" ]; then
        echo "Removing SQLite file: $DB_PATH"
        rm -f "$DB_PATH"
    fi
fi

# For Postgres: drop + recreate the schema (DO NOT drop the database itself)
if [[ "$DATABASE_URL" == postgresql://* ]] || [[ "$DATABASE_URL" == postgres://* ]]; then
    echo "Dropping public schema on Postgres…"
    bunx prisma migrate reset --force --skip-seed 2>/dev/null || true
fi

# Re-apply schema
echo "Pushing schema…"
bun run db:push

echo ""
echo "✅ Database reset complete."
echo "   The database is now empty. You can register a fresh admin account."
echo "   Set ADMIN_EMAILS in .env to auto-promote your first admin on sign-in."
