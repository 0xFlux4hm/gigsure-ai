# GigSure AI — Multi-stage production Dockerfile
#
# Build:   docker build -t gigsure-ai:latest .
# Run:     docker run -p 3000:3000 --env-file .env gigsure-ai:latest
#
# Stages:
#   1. deps   — install production dependencies
#   2. builder — build Next.js standalone output
#   3. runner  — minimal runtime image (no dev deps, no source)

# ---- Stage 1: Install dependencies ----
FROM oven/bun:1.4.4-debian AS deps

WORKDIR /app

# Copy lockfile + package.json first for better layer caching
COPY package.json bun.lock* ./

# Install ALL deps (including dev for build)
RUN bun install --frozen-lockfile

# ---- Stage 2: Build ----
FROM oven/bun:1.4.4-debian AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (no secrets at this stage)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client
RUN bun run db:generate

# Build Next.js (produces .next/standalone/)
RUN bun run build

# ---- Stage 3: Runtime ----
FROM oven/bun:1.4.4-debian AS runner

WORKDIR /app

# Install openssl (required by Prisma on debian-slim)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes only what's needed)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy Prisma migrations + schema (for runtime migration on startup)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy startup script
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Healthcheck — app must respond 200 on /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
