/**
 * Test setup — runs before every test file.
 *
 * Sets DATABASE_URL environment variable BEFORE any module imports.
 * This ensures @/lib/db (PrismaClient singleton) connects to the test DB,
 * not the dev DB.
 */
import { beforeAll, beforeEach, afterAll } from "vitest";
import { execSync } from "child_process";

// Set env vars BEFORE importing anything that uses Prisma.
// Vitest reads this synchronously on first import.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "file:/tmp/gigsure-test.db";

// Apply env immediately (must be done at module-eval time, not in a hook)
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NEXTAUTH_SECRET = "test-secret-only-for-vitest-32chars";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";

beforeAll(() => {
  // Push schema to the test DB (idempotent — safe to re-run)
  execSync("bunx prisma db push --accept-data-loss", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
});

beforeEach(async () => {
  // Clean tables before each test (lazy-load Prisma after env is set)
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  await db.$transaction([
    db.disputeReview.deleteMany(),
    db.disputeMessage.deleteMany(),
    db.disputeEvidence.deleteMany(),
    db.dispute.deleteMany(),
    db.webhookEvent.deleteMany(),
    db.fundingRecord.deleteMany(),
    db.milestone.deleteMany(),
    db.compensationAcceptance.deleteMany(),
    db.compensationAllocation.deleteMany(),
    db.compensationAgreement.deleteMany(),
    db.deliverable.deleteMany(),
    db.task.deleteMany(),
    db.contractAcceptance.deleteMany(),
    db.contractVersion.deleteMany(),
    db.invitation.deleteMany(),
    db.projectMembership.deleteMany(),
    db.project.deleteMany(),
    db.notification.deleteMany(),
    db.auditEvent.deleteMany(),
    db.aiActivity.deleteMany(),
    db.privacyRequest.deleteMany(),
    db.emailVerificationToken.deleteMany(),
    db.passwordResetToken.deleteMany(),
    db.linkedAccount.deleteMany(),
    db.userIdentity.deleteMany(),
    db.userPreferences.deleteMany(),
    db.userProfile.deleteMany(),
    db.user.deleteMany(),
  ]);
  await db.$disconnect();
});

afterAll(async () => {
  // Cleanup hook — nothing to do for now
});
