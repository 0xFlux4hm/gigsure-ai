/**
 * Initiate a payment for a project milestone.
 *
 * Body: {
 *   projectId: string,
 *   milestoneId: string,
 *   provider?: "monnify" | "opay" | "mock"  (defaults to system default)
 * }
 *
 * Flow:
 *   1. Verify auth + project membership + KYC
 *   2. Look up milestone + calculate fee breakdown (1.5%)
 *   3. Create PaymentTransaction record
 *   4. Call provider's initiatePayment()
 *   5. Store provider reference + checkout URL
 *   6. Return checkout URL to frontend
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { isUserKycVerified } from "@/lib/kyc/provider";
import { calculatePaymentBreakdown } from "@/lib/payments/fee-calculator";
import { getDefaultProvider, getProvider, isLivePaymentsEnabled } from "@/lib/payments/registry";
import { generateProviderTxRef } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

const Schema = z.object({
  projectId: z.string().cuid(),
  milestoneId: z.string().cuid(),
  provider: z.enum(["monnify", "opay", "mock"]).optional(),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid request", 422); }

  const { projectId, milestoneId } = parsed.data;

  // Verify project membership + funding permission
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "funding:initiate");

  // Require KYC
  const kycVerified = await isUserKycVerified(userId);
  if (!kycVerified) return fail("KYC verification required", 403);

  // Get project + milestone
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, currency: true, title: true },
  });
  if (!project) return fail("Project not found", 404);

  const milestone = await db.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, title: true, amountMinor: true, status: true, projectId: true },
  });
  if (!milestone || milestone.projectId !== projectId) {
    return fail("Milestone not found in this project", 404);
  }
  if (!["DRAFT", "AWAITING_FUNDING"].includes(milestone.status)) {
    return fail(`Milestone cannot be funded in status: ${milestone.status}`, 400);
  }

  // Get user info for the payment
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true },
  });
  if (!user) return fail("User not found", 404);

  // Calculate fee breakdown (1.5%)
  const breakdown = calculatePaymentBreakdown(milestone.amountMinor);

  // Select provider
  let providerName = parsed.data.provider;
  if (providerName) {
    // If user requests a specific provider, verify it's enabled
    if (providerName !== "mock" && !isLivePaymentsEnabled()) {
      return fail("Live payments are not enabled. Use mock provider for testing.", 403);
    }
  } else {
    const defaultProvider = getDefaultProvider();
    providerName = defaultProvider.name;
  }

  const provider = getProvider(providerName);
  if (!provider.isEnabled()) {
    return fail(`Provider '${providerName}' is not enabled.`, 403);
  }

  // Create internal payment reference
  const paymentReference = `GS_pay_${generateProviderTxRef("").replace("GS_", "")}`;

  // Create PaymentTransaction record
  const transaction = await db.paymentTransaction.create({
    data: {
      projectId,
      milestoneId,
      userId,
      paymentReference,
      provider: providerName,
      amountMinor: milestone.amountMinor,
      currency: project.currency,
      status: "CREATED",
      feeMinor: breakdown.feeMinor,
      netMinor: breakdown.netMinor,
      feePolicyVersion: breakdown.policyVersion,
      feeRateBps: breakdown.rateBps,
      customerEmail: user.email,
      customerName: user.displayName,
      description: `Milestone: ${milestone.title} — ${project.title}`,
      metadata: JSON.stringify({
        milestoneTitle: milestone.title,
        projectTitle: project.title,
      }),
    },
  });

  // Call provider to initiate payment
  try {
    const result = await provider.initiatePayment({
      paymentReference: transaction.paymentReference,
      amountMinor: milestone.amountMinor,
      currency: project.currency,
      customerEmail: user.email,
      customerName: user.displayName,
      paymentDescription: `GigSure AI — ${milestone.title}`,
      redirectUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/?view=project-funding&project=${projectId}`,
      feeMinor: breakdown.feeMinor,
      netMinor: breakdown.netMinor,
      policyVersion: breakdown.policyVersion,
      metadata: { transactionId: transaction.id, projectId, milestoneId },
    });

    // Update transaction with provider reference + checkout URL
    await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        providerReference: result.providerReference,
        checkoutUrl: result.checkoutUrl ?? null,
        status: result.status,
        redirectUrl: `${process.env.NEXTAUTH_URL ?? ""}/?view=project-funding&project=${projectId}`,
      },
    });

    // Create initial ledger entries
    await db.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        entryType: "PAYMENT",
        amountMinor: milestone.amountMinor,
        currency: project.currency,
        accountType: "PROVIDER_CLEARING",
        description: `Payment initiated for milestone: ${milestone.title}`,
      },
    });
    await db.ledgerEntry.create({
      data: {
        transactionId: transaction.id,
        entryType: "FEE",
        amountMinor: -breakdown.feeMinor, // fee is a debit to the freelancer
        currency: project.currency,
        accountType: "PLATFORM_FEE_REVENUE",
        description: `Platform fee (${breakdown.rateBps / 100}% — policy ${breakdown.policyVersion})`,
      },
    });

    await recordAuditEvent({
      actorId: userId,
      projectId,
      action: "payment.initiated",
      targetType: "PaymentTransaction",
      targetId: transaction.id,
      metadata: {
        provider: providerName,
        amountMinor: milestone.amountMinor,
        feeMinor: breakdown.feeMinor,
        netMinor: breakdown.netMinor,
        providerReference: result.providerReference,
      },
    });

    return {
      transactionId: transaction.id,
      paymentReference: transaction.paymentReference,
      provider: providerName,
      providerReference: result.providerReference,
      checkoutUrl: result.checkoutUrl,
      status: result.status,
      amountMinor: milestone.amountMinor,
      feeMinor: breakdown.feeMinor,
      netMinor: breakdown.netMinor,
      feeRate: `${breakdown.rateBps / 100}%`,
      feePayer: "freelancer",
      currency: project.currency,
      simulated: false,
    };
  } catch (err) {
    // Mark transaction as FAILED
    await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED" },
    });
    logSecurityEvent("error", "payment.initiate_failed", {
      transactionId: transaction.id,
      provider: providerName,
      error: (err as Error).message,
    });
    return fail(`Payment initiation failed: ${(err as Error).message}`, 500);
  }
});
