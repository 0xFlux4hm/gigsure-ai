import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// gate Prisma query logging on dev/test only.
// In production, `log: ['query']` writes every SQL statement (with bound
// parameters — including emails, hashed tokens, dispute bodies) to stdout,
// which is captured by log aggregators (Loki, CloudWatch, Datadog).
const prismaLogConfig = process.env.NODE_ENV === 'production'
  ? ['error', 'warn']
  : ['query', 'error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogConfig as ("query" | "error" | "warn")[],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
