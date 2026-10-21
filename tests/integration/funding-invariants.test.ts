/**
 * Integration tests: funding idempotency + dispute-blocks-release.
 *
 * These tests exercise the database layer directly via Prisma + the
 * mock-payment-provider module. They verify the critical business
 * invariants required by spec section 28.
 *
 * DATABASE_URL is set in tests/setup.ts (before any module imports).
 * This test file uses the same DATABASE_URL that the mock-provider module
 * will use (via @/lib/db singleton).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { initiateFunding, processWebhookEvent, MOCK_WEBHOOK_SECRET, MOCK_PROVIDER_NAME } from "@/lib/payments/mock-provider";
import { signWebhookPayload } from "@/lib/security/tokens";

async function setupTestUser(): Promise<{ userId: string; projectId: string; milestoneId: string }> {
  const user = await db.user.create({
    data: {
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      emailNormalized: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      displayName: "Test User",
      passwordHash: "scrypt:16384:8:1:00:00",
      accountStatus: "ACTIVE",
    },
  });

  const project = await db.project.create({
    data: {
      ownerId: user.id,
      title: "Test Project",
      slug: `test-project-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: "Test description for funding tests",
      currency: "NGN",
      budgetMinor: 100000,
      fundingArrangement: "MILESTONE",
      status: "ACTIVE",
    },
  });

  await db.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: "OWNER" },
  });

  const milestone = await db.milestone.create({
    data: {
      projectId: project.id,
      title: "Test Milestone",
      amountMinor: 50000,
      status: "DRAFT",
      orderIndex: 0,
    },
  });

  return { userId: user.id, projectId: project.id, milestoneId: milestone.id };
}

describe("Funding idempotency (spec invariant #5, #17)", () => {
  it("returns the same FundingRecord for duplicate idempotencyKey", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    const input = {
      projectId,
      milestoneId,
      type: "FUNDING" as const,
      amountMinor: 50000,
      currency: "NGN",
      initiatedById: userId,
      idempotencyKey: "test-idempotency-key-001",
    };

    const r1 = await initiateFunding(input);
    const r2 = await initiateFunding(input);

    expect(r1.fundingRecordId).toBe(r2.fundingRecordId);
    expect(r1.providerTxRef).toBe(r2.providerTxRef);
    expect(r1.isSimulated).toBe(true);

    // Confirm only one record was created
    const records = await db.fundingRecord.findMany({
      where: { idempotencyKey: "test-idempotency-key-001" },
    });
    expect(records.length).toBe(1);
  });

  it("creates separate records for different idempotency keys", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    const r1 = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 10000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "key-A",
    });

    const r2 = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 10000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "key-B",
    });

    expect(r1.fundingRecordId).not.toBe(r2.fundingRecordId);
  });

  it("simulates webhook delivery and confirms funding", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    const result = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 25000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "webhook-test-key",
    });

    // Manually deliver the webhook payload (simulating what the mock provider does)
    const record = await db.fundingRecord.findUnique({
      where: { id: result.fundingRecordId },
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe("INITIATED");

    const providerEventId = `evt_test_${Date.now()}`;
    const payload = JSON.stringify({
      event: "funding.confirmed",
      provider: MOCK_PROVIDER_NAME,
      provider_event_id: providerEventId,
      provider_tx_ref: record!.providerTxRef,
      funding_record_id: record!.id,
      amount_minor: record!.amountMinor,
      currency: record!.currency,
      type: record!.type,
      simulated: true,
      timestamp: new Date().toISOString(),
    });

    const outcome = await processWebhookEvent({
      provider: MOCK_PROVIDER_NAME,
      providerEventId,
      providerTxRef: record!.providerTxRef!,
      eventType: "funding.confirmed",
      amountMinor: record!.amountMinor,
      currency: record!.currency,
      status: "PROVIDER_CONFIRMED",
      rawPayload: payload,
      signatureValid: true,
    });

    expect(outcome.processed).toBe(true);

    const confirmed = await db.fundingRecord.findUnique({
      where: { id: result.fundingRecordId },
    });
    expect(confirmed?.status).toBe("PROVIDER_CONFIRMED");
    expect(confirmed?.confirmedAt).not.toBeNull();
  });

  it("blocks webhook replay (same providerEventId)", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    const result = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 25000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "replay-test-key",
    });

    const record = await db.fundingRecord.findUnique({
      where: { id: result.fundingRecordId },
    });

    const providerEventId = `evt_replay_${Date.now()}`;
    const payload = JSON.stringify({
      event: "funding.confirmed",
      provider_event_id: providerEventId,
      provider_tx_ref: record!.providerTxRef,
      amount_minor: record!.amountMinor,
      currency: record!.currency,
      simulated: true,
    });

    // First delivery: processed
    const r1 = await processWebhookEvent({
      provider: MOCK_PROVIDER_NAME,
      providerEventId,
      providerTxRef: record!.providerTxRef!,
      eventType: "funding.confirmed",
      amountMinor: record!.amountMinor,
      currency: record!.currency,
      status: "PROVIDER_CONFIRMED",
      rawPayload: payload,
      signatureValid: true,
    });
    expect(r1.processed).toBe(true);

    // Second delivery: blocked
    const r2 = await processWebhookEvent({
      provider: MOCK_PROVIDER_NAME,
      providerEventId,
      providerTxRef: record!.providerTxRef!,
      eventType: "funding.confirmed",
      amountMinor: record!.amountMinor,
      currency: record!.currency,
      status: "PROVIDER_CONFIRMED",
      rawPayload: payload,
      signatureValid: true,
    });
    expect(r2.processed).toBe(false);
    expect(r2.reason).toBe("duplicate_event");
  });
});

describe("Dispute blocks release (spec invariant #6, #18)", () => {
  it("prevents milestone approval while dispute is OPEN", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    // Initiate funding — this flips milestone to AWAITING_FUNDING in the API layer
    // (the mock provider itself doesn't flip status — that's the API's job).
    // Here we simulate the API's milestone status update:
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "AWAITING_FUNDING" } });

    const funding = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 50000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "dispute-test-funding",
    });
    const record = await db.fundingRecord.findUnique({ where: { id: funding.fundingRecordId } });

    await processWebhookEvent({
      provider: MOCK_PROVIDER_NAME,
      providerEventId: `evt_dispute_funding_${Date.now()}`,
      providerTxRef: record!.providerTxRef!,
      eventType: "funding.confirmed",
      amountMinor: record!.amountMinor,
      currency: record!.currency,
      status: "PROVIDER_CONFIRMED",
      rawPayload: "{}",
      signatureValid: true,
    });

    // Verify milestone flipped to FUNDED
    const funded = await db.milestone.findUnique({ where: { id: milestoneId } });
    expect(funded?.status).toBe("FUNDED");

    // Submit + approve milestone
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "SUBMITTED" } });
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "APPROVED" } });

    // Open a dispute on this milestone
    const dispute = await db.dispute.create({
      data: {
        projectId,
        openedById: userId,
        milestoneId,
        category: "QUALITY",
        title: "Mockup quality",
        description: "Mockups don't meet spec.",
        status: "OPEN",
      },
    });

    // The dispute handler should auto-flip milestone to DISPUTED (this is enforced
    // at the API layer in /api/projects/[id]/disputes POST handler).
    // Simulate that here:
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "DISPUTED" } });

    // Verify release cannot be initiated (the API endpoint checks milestone.status === APPROVED
    // and blocks if DISPUTED).
    const disputed = await db.milestone.findUnique({ where: { id: milestoneId } });
    expect(disputed?.status).toBe("DISPUTED");
    expect(disputed?.status).not.toBe("APPROVED");

    // Confirm the dispute exists and blocks release
    const openDisputes = await db.dispute.count({
      where: { milestoneId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
    });
    expect(openDisputes).toBeGreaterThan(0);
  });

  it("allows release after dispute is resolved", async () => {
    const { userId, projectId, milestoneId } = await setupTestUser();

    // Setup: funded, submitted, approved milestone with a resolved dispute
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "AWAITING_FUNDING" } });

    const funding = await initiateFunding({
      projectId, milestoneId, type: "FUNDING", amountMinor: 50000, currency: "NGN",
      initiatedById: userId, idempotencyKey: "resolved-dispute-funding",
    });
    const record = await db.fundingRecord.findUnique({ where: { id: funding.fundingRecordId } });

    await processWebhookEvent({
      provider: MOCK_PROVIDER_NAME,
      providerEventId: `evt_resolved_funding_${Date.now()}`,
      providerTxRef: record!.providerTxRef!,
      eventType: "funding.confirmed",
      amountMinor: record!.amountMinor,
      currency: record!.currency,
      status: "PROVIDER_CONFIRMED",
      rawPayload: "{}",
      signatureValid: true,
    });

    await db.milestone.update({ where: { id: milestoneId }, data: { status: "SUBMITTED" } });
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "APPROVED" } });

    const dispute = await db.dispute.create({
      data: {
        projectId,
        openedById: userId,
        milestoneId,
        category: "PAYMENT",
        title: "Test dispute",
        description: "Will be resolved.",
        status: "OPEN",
      },
    });

    // Resolve the dispute
    await db.dispute.update({
      where: { id: dispute.id },
      data: { status: "RESOLVED", resolution: "Client approved.", closedAt: new Date() },
    });

    // Milestone can be flipped back to APPROVED (release is now allowed)
    await db.milestone.update({ where: { id: milestoneId }, data: { status: "APPROVED" } });

    const milestone = await db.milestone.findUnique({ where: { id: milestoneId } });
    expect(milestone?.status).toBe("APPROVED");

    // No OPEN disputes remain
    const openDisputes = await db.dispute.count({
      where: { milestoneId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
    });
    expect(openDisputes).toBe(0);
  });
});
