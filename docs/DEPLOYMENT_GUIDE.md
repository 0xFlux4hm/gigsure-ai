# GigSure AI — Deployment Guide

## Local development

```bash
git clone <repo>
cd gigsure-ai
bun install
cp .env.example .env
# Edit .env: set NEXTAUTH_SECRET, NEXTAUTH_URL
bun run db:push
bun run dev
```

Visit http://localhost:3000/?view=register to create your first account.

## Production prerequisites

Before any production deployment:

1. **Database**: PostgreSQL (not SQLite). Update `prisma/schema.prisma` → `provider = "postgresql"`.
2. **Domain + TLS**: valid domain with HTTPS certificate (Let's Encrypt or managed).
3. **NextAuth secret**: `openssl rand -base64 32` → set as `NEXTAUTH_SECRET`.
4. **NEXTAUTH_URL**: set to public HTTPS URL.
5. **Google OAuth**: real credentials in Google Cloud Console + redirect URI configured.
6. **Email delivery**: SMTP provider (SendGrid, Mailgun, AWS SES) configured.
7. **Payment provider**: if enabling real payments, complete integration + regulatory review first (see `PAYMENT_INTEGRATION.md`).
8. **Backups**: PostgreSQL `pg_dump` daily + PITR.
9. **Monitoring**: structured logs to a log aggregator (Datadog, Loki, CloudWatch).
10. **Secrets**: stored in a secrets manager (AWS Secrets Manager, Doppler, Vault) — never in plaintext env files.
11. **CI**: lint + tests + audit on every PR.
12. **CDN**: serve static assets via CDN (Cloudflare, Vercel Edge).

## Deployment options

### Option A: Vercel (recommended for Next.js)

```bash
vercel --prod
```

Set env vars in Vercel project settings. Postgres via Vercel Postgres or external provider (Neon, Supabase).

### Option B: Self-hosted (Docker)

```dockerfile
# Dockerfile (sketch)
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run db:generate
RUN bun run build
EXPOSE 3000
CMD ["bun", ".next/standalone/server.js"]
```

```yaml
# docker-compose.yml (sketch)
services:
  web:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgres://...
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://gigsure.example.com
      # ... other env
    depends_on: [db]
  db:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
volumes:
  pgdata:
```

### Option C: Node server behind reverse proxy

```bash
bun run build
NODE_ENV=production bun .next/standalone/server.js
```

Behind nginx/Caddy with TLS termination.

## Post-deployment verification

```bash
# 1. Health check
curl https://your-domain.com/api/auth/providers
# Should return JSON with credentials + google providers

# 2. DB connectivity
bun run db:migrate status

# 3. Smoke test
# - Register a new account
# - Verify email
# - Create a project
# - Invite a collaborator
# - Initiate mock funding
# - Open and resolve a dispute
# - Run an AI assistant
# - Export personal data
```

## Rollback

```bash
# Database rollback (if migration caused issues)
bun run db:migrate resolve --rolled-back <migration_name>

# Application rollback
# Re-deploy previous image / git SHA
git checkout <previous-tag>
bun run build
# restart process
```

## Incident response

1. **Detect**: monitoring alerts on error rate / latency / 5xx.
2. **Triage**: identify scope (auth? payments? specific endpoint?).
3. **Contain**: disable affected feature flag if possible.
4. **Eradicate**: deploy fix.
5. **Recover**: verify fix; restore data from backup if needed.
6. **Postmortem**: blameless doc within 7 days.

## Credential rotation

| Credential | Rotation frequency |
|-----------|-------------------|
| `NEXTAUTH_SECRET` | Quarterly (requires re-login for all users) |
| Google OAuth client secret | On personnel change or suspicion of leak |
| Payment provider API keys | On personnel change or quarterly |
| Database password | Quarterly |
| Webhook signing secret | On suspicion of leak |

## Backup & recovery

- **PostgreSQL**: daily `pg_dump` + continuous WAL archiving for PITR
- **Object storage** (for evidence files): bucket versioning + cross-region replication
- **Restore test**: monthly restore into a staging DB to verify backup integrity

## What NOT to do

- ❌ Do NOT deploy with `GOOGLE_CLIENT_ID=demo_*` — that triggers the demo Google flow
- ❌ Do NOT deploy with SQLite as the database
- ❌ Do NOT deploy without HTTPS
- ❌ Do NOT enable real payments without completing `docs/PAYMENT_INTEGRATION.md` checklist
- ❌ Do NOT log to stdout in production (use structured logging to a sink)
- ❌ Do NOT commit `.env` to git
- ❌ Do NOT disable security controls to make tests pass
