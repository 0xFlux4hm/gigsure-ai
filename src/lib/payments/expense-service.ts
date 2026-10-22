/**
 * Project Expense service — handles the lifecycle of expense requests
 * made by service providers against already-funded milestones.
 *
 * Flow:
 *   1. Service provider REQUESTS an expense (e.g., "₦50,000 for domain + hosting")
 *   2. Client APPROVES the request
 *   3. Platform RELEASES the funds from the milestone's held balance
 *      to the service provider's bank account
 *   4. Service provider uploads a receipt as proof of purchase
 *
 * The milestone must already be FUNDED — the money is already held in
 * GigSure Payment Protection. The expense is a partial release of those
 * funds before the milestone is completed.
 */
import { db } from "@/lib/db";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { initiatePayoutsForRelease } from "@/lib/payments/payout-service";
import { createFundingRecord } from "@/lib/payments/funding-service";
import { confirmFundingRecord } from "@/lib/payments/webhook-handler";

export type ExpenseCategory =
  | "DOMAIN_HOSTING"
  | "SOFTWARE_LICENSE"
  | "STOCK_ASSETS"
  | "THIRD_PARTY_SERVICES"
  | "HARDWARE"
  | "OTHER";

export type ExpenseStatus =
  | "REQUESTED"
  | "APPROVED"
  | "RELEASED"
  | "REJECTED"
  | "DISPUTED";

export type CreateExpenseInput = {
  projectId: string;
  milestoneId: string;
  requestedById: string;
  title: string;
  description?: string;
  category: ExpenseCategory;
  amountMinor: number;
  currency: string;
};

export async function createExpenseRequest(
  input: CreateExpenseInput,
): Promise<{ expenseId: string }> {
  // Validate the milestone is funded and belongs to the project
  const milestone = await db.milestone.findUnique({
    where: { id: input.milestoneId },
    select: { id: true, projectId: true, status: true, amountMinor: true, currency: true },
  });
  if (!milestone || milestone.projectId !== input.projectId) {
    throw new Error("Milestone not found in this project");
  }
  if (milestone.status !== "FUNDED" && milestone.status !== "SUBMITTED" && milestone.status !== "APPROVED") {
    throw new Error(
      `Cannot request expense: milestone must be FUNDED (current: ${milestone.status}). ` +
        "The client must fund the milestone first.",
    );
  }

  // Check that the requested amount doesn't exceed the milestone's funded amount
  if (input.amountMinor <= 0) {
    throw new Error("Expense amount must be greater than zero");
  }

  // Check existing approved/released expenses don't exceed milestone amount
  const existingExpenses = await db.projectExpense.aggregate({
    where: {
      milestoneId: input.milestoneId,
      status: { in: ["APPROVED", "RELEASED"] },
    },
    _sum: { amountMinor: true },
  });
  const alreadyRequested = existingExpenses._sum.amountMinor ?? 0;
  if (alreadyRequested + input.amountMinor > milestone.amountMinor) {
    throw new Error(
      `Expense request exceeds milestone amount. Milestone: ₦${milestone.amountMinor / 100}, ` +
        `already requested: ₦${alreadyRequested / 100}, this request: ₦${input.amountMinor / 100}.`,
    );
  }

  // Verify the requester is a member of the project
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.requestedById } },
  });
  if (!membership || membership.revokedAt) {
    throw new Error("Only project members can request expenses");
  }

  const expense = await db.projectExpense.create({
    data: {
      projectId: input.projectId,
      milestoneId: input.milestoneId,
      requestedById: input.requestedById,
      title: input.title,
      description: input.description,
      category: input.category,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "REQUESTED",
    },
  });

  await recordAuditEvent({
    actorId: input.requestedById,
    projectId: input.projectId,
    expenseId: expense.id,
    action: "expense.requested",
    targetType: "ProjectExpense",
    targetId: expense.id,
    metadata: {
      milestoneId: input.milestoneId,
      title: input.title,
      category: input.category,
      amountMinor: input.amountMinor,
    },
  });

  return { expenseId: expense.id };
}

export async function approveExpense(
  expenseId: string,
  approverId: string,
): Promise<void> {
  const expense = await db.projectExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, projectId: true, milestoneId: true, status: true, amountMinor: true, requestedById: true },
  });
  if (!expense) throw new Error("Expense not found");
  if (expense.status !== "REQUESTED") {
    throw new Error(`Cannot approve expense in status: ${expense.status}`);
  }

  // Verify the approver is the project owner or client
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: expense.projectId, userId: approverId } },
  });
  if (!membership || membership.revokedAt) {
    throw new Error("Only project members can approve expenses");
  }
  if (membership.role !== "OWNER" && membership.role !== "CLIENT") {
    throw new Error("Only the project owner or client can approve expenses");
  }

  await db.projectExpense.update({
    where: { id: expenseId },
    data: {
      status: "APPROVED",
      approvedById: approverId,
      approvedAt: new Date(),
    },
  });

  await recordAuditEvent({
    actorId: approverId,
    projectId: expense.projectId,
    expenseId,
    action: "expense.approved",
    targetType: "ProjectExpense",
    targetId: expenseId,
    metadata: { amountMinor: expense.amountMinor },
  });
}

export async function rejectExpense(
  expenseId: string,
  rejectorId: string,
  reason: string,
): Promise<void> {
  const expense = await db.projectExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, projectId: true, status: true },
  });
  if (!expense) throw new Error("Expense not found");
  if (expense.status !== "REQUESTED") {
    throw new Error(`Cannot reject expense in status: ${expense.status}`);
  }

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: expense.projectId, userId: rejectorId } },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "CLIENT")) {
    throw new Error("Only the project owner or client can reject expenses");
  }

  await db.projectExpense.update({
    where: { id: expenseId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });

  await recordAuditEvent({
    actorId: rejectorId,
    projectId: expense.projectId,
    expenseId,
    action: "expense.rejected",
    targetType: "ProjectExpense",
    targetId: expenseId,
    metadata: { reason },
  });
}

/**
 * Release the approved expense funds to the service provider's bank account.
 * This creates a FundingRecord (type=RELEASE) and triggers the payout flow
 * via the existing payout-service.
 */
export async function releaseExpense(
  expenseId: string,
  initiatedById: string,
): Promise<{ fundingRecordId: string }> {
  // SECURITY: Use a transaction with conditional update to prevent
  // race conditions (duplicate payouts from concurrent release requests).
  // The conditional update atomically checks status=APPROVED and sets
  // status=RELEASING — if another request already did this, the update
  // affects 0 rows and we throw.
  const expense = await db.projectExpense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      projectId: true,
      milestoneId: true,
      status: true,
      amountMinor: true,
      currency: true,
      title: true,
      requestedById: true,
      fundingRecordId: true,
    },
  });
  if (!expense) throw new Error("Expense not found");

  // If already released, return the existing funding record (idempotent)
  if (expense.status === "RELEASED" && expense.fundingRecordId) {
    return { fundingRecordId: expense.fundingRecordId };
  }

  if (expense.status !== "APPROVED") {
    throw new Error(`Cannot release expense in status: ${expense.status}. Client must approve first.`);
  }

  // Atomically claim the expense (prevents concurrent release race condition)
  const claimed = await db.projectExpense.updateMany({
    where: { id: expenseId, status: "APPROVED" },
    data: { status: "RELEASED" },
  });
  if (claimed.count === 0) {
    // Another request already claimed it — re-read and return idempotently
    const refreshed = await db.projectExpense.findUnique({
      where: { id: expenseId },
      select: { status: true, fundingRecordId: true },
    });
    if (refreshed?.status === "RELEASED" && refreshed.fundingRecordId) {
      return { fundingRecordId: refreshed.fundingRecordId };
    }
    throw new Error("Expense was not in APPROVED status (may have been released by another request)");
  }

  // Create a FundingRecord (type=RELEASE) with deterministic idempotency key
  const fundingRecord = await createFundingRecord({
    projectId: expense.projectId,
    milestoneId: expense.milestoneId,
    type: "RELEASE",
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    initiatedById,
    idempotencyKey: `expense-release-${expenseId}`,
  });

  // Link the expense to the funding record
  await db.projectExpense.update({
    where: { id: expenseId },
    data: {
      fundingRecordId: fundingRecord.fundingRecordId,
      releasedAt: new Date(),
    },
  });

  // Confirm the funding record immediately (the release is initiated by the client)
  // This triggers initiatePayoutsForRelease() inside confirmFundingRecord()
  await confirmFundingRecord({
    provider: "internal",
    providerEventId: `expense_release_${fundingRecord.fundingRecordId}_${Date.now()}`,
    providerTxRef: fundingRecord.providerTxRef,
    eventType: "release.confirmed",
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    status: "PROVIDER_CONFIRMED",
    rawPayload: JSON.stringify({
      type: "EXPENSE_RELEASE",
      expenseId,
      fundingRecordId: fundingRecord.fundingRecordId,
      initiatedBy: initiatedById,
    }),
    signatureValid: true,
  });

  await recordAuditEvent({
    actorId: initiatedById,
    projectId: expense.projectId,
    expenseId,
    fundingRecordId: fundingRecord.fundingRecordId,
    action: "expense.released",
    targetType: "ProjectExpense",
    targetId: expenseId,
    metadata: {
      amountMinor: expense.amountMinor,
      title: expense.title,
    },
  });

  return { fundingRecordId: fundingRecord.fundingRecordId };
}

/**
 * Upload a receipt for a released expense (proof of purchase).
 */
export async function uploadExpenseReceipt(
  expenseId: string,
  userId: string,
  receiptUrl: string,
): Promise<void> {
  const expense = await db.projectExpense.findUnique({
    where: { id: expenseId },
    select: { id: true, projectId: true, status: true, requestedById: true },
  });
  if (!expense) throw new Error("Expense not found");
  if (expense.status !== "RELEASED") {
    throw new Error("Receipt can only be uploaded for released expenses");
  }
  if (expense.requestedById !== userId) {
    throw new Error("Only the expense requester can upload a receipt");
  }

  await db.projectExpense.update({
    where: { id: expenseId },
    data: {
      receiptUrl,
      receiptUploadedAt: new Date(),
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId: expense.projectId,
    expenseId,
    action: "expense.receipt_uploaded",
    targetType: "ProjectExpense",
    targetId: expenseId,
    metadata: { receiptUrl },
  });
}
