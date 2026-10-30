/**
 * Generate or fetch a per-project virtual account the client can transfer into.
 *
 * GET  /api/projects/[id]/virtual-account
 *   - Returns the project's existing active virtual account, or creates one.
 *   - Query: ?milestoneId=xxx — bind the account to a specific milestone amount.
 *
 * POST /api/projects/[id]/virtual-account
 *   Body: { milestoneId? }
 *   - Explicitly create a new virtual account. Useful when refreshing an
 *     expired one or generating a fresh one for a new milestone.
 *
 * Flow:
 *   1. Verify auth + project membership + KYC.
 *   2. Check for an existing ACTIVE VirtualAccount on this project.
 *   3. If none, call provider.createReservedAccount() with project slug as ref.
 *   4. Persist VirtualAccount row, return account number + bank name + amount.
 *
 * Client then transfers via bank app/POS to the returned account number.
 * Monnify sends a webhook when funds land — webhook handler credits the
 * FundingRecord + advances milestone to FUNDED.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { assertPermission, AuthzError } from "@/lib/auth/authorization";
import { isUserKycVerified } from "@/lib/kyc/provider";
import { getDefaultProvider } from "@/lib/payments/registry";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/admin-access";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  milestoneId: z.string().cuid().optional(),
});

async function generateVirtualAccount(
  projectId: string,
  milestoneId: string | undefined,
  userId: string,
): Promise<{ accountNumber: string; accountName: string; bankName: string; bankCode: string; provider: string }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, slug: true, currency: true, budgetMinor: true },
  });
  if (!project) throw new Error("Project not found");

  // If milestone-bound, get the expected amount for the reserved account cap.
  let expectedAmountMinor: number | undefined;
  if (milestoneId) {
    const milestone = await db.milestone.findUnique({
      where: { id: milestoneId },
      select: { amountMinor: true, projectId: true },
    });
    if (!milestone || milestone.projectId !== projectId) {
      throw new Error("Milestone not found in this project");
    }
    expectedAmountMinor = milestone.amountMinor;
  }

  const provider = await getDefaultProvider();
  if (!provider.createReservedAccount) {
    throw new Error(
      `Provider ${provider.name} does not support reserved accounts. Use Monnify provider for virtual accounts.`,
    );
  }

  // Reference must be unique per project — use project ID (or milestone ID if bound).
  const reference = milestoneId ? `gs-${projectId.slice(-8)}-${milestoneId.slice(-8)}` : `gs-${projectId}`;
  const accountName = `GigSure/${project.slug.slice(0, 20)}`;

  const reserved = await provider.createReservedAccount({
    reference,
    accountName,
    currency: project.currency,
    expectedAmountMinor,
    metadata: { projectId, milestoneId, userId },
  });

  // Persist the virtual account.
  await db.virtualAccount.create({
    data: {
      projectId,
      milestoneId,
      provider: provider.name,
      providerAccountRef: reserved.providerAccountRef,
      accountNumber: reserved.accountNumber,
      accountName: reserved.accountName,
      bankName: reserved.bankName,
      bankCode: reserved.bankCode,
      status: "ACTIVE",
      expectedAmountMinor,
      expiresAt: reserved.expiresAt,
    },
  });

  await recordAuditEvent({
    actorId: userId,
    projectId,
    action: "virtual_account.created",
    targetType: "VirtualAccount",
    targetId: reserved.providerAccountRef,
    metadata: {
      accountNumber: reserved.accountNumber,
      bankCode: reserved.bankCode,
      milestoneId,
    },
  });

  return {
    accountNumber: reserved.accountNumber,
    accountName: reserved.accountName,
    bankName: reserved.bankName,
    bankCode: reserved.bankCode,
    provider: provider.name,
  };
}

export const GET = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const projectId = params.id;
  const url = new URL(req.url);
  const milestoneId = url.searchParams.get("milestoneId") ?? undefined;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);

  // SECURITY: Only members with funding:initiate permission (OWNER) can
  // view virtual account details — including existing accounts.
  // This prevents COLLABORATOR/REVIEWER from seeing the funding account number.
  assertPermission(membership, "funding:initiate");

  // Find existing ACTIVE virtual account on this project.
  const existing = await db.virtualAccount.findFirst({
    where: {
      projectId,
      milestoneId: milestoneId ?? null,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return {
      virtualAccount: {
        id: existing.id,
        accountNumber: existing.accountNumber,
        accountName: existing.accountName,
        bankName: existing.bankName,
        bankCode: existing.bankCode,
        provider: existing.provider,
        status: existing.status,
        expectedAmountMinor: existing.expectedAmountMinor,
        totalReceivedMinor: existing.totalReceivedMinor,
        expiresAt: existing.expiresAt,
        createdAt: existing.createdAt,
      },
    };
  }

  // None exists — create one (caller needs funding permission + KYC).
  try {
    assertPermission(membership, "funding:initiate");
    const kycVerified = await isUserKycVerified(userId);
    if (!kycVerified) {
      return fail("KYC verification required before generating a virtual account.", 403);
    }
    const result = await generateVirtualAccount(projectId, milestoneId, userId);
    return {
      virtualAccount: {
        ...result,
        provider: result.provider,
        status: "ACTIVE",
        expectedAmountMinor: undefined,
        totalReceivedMinor: 0,
        createdAt: new Date(),
      },
    };
  } catch (err) {
    logSecurityEvent("error", "virtual_account.generate_failed", {
      message: (err as Error)?.message,
      projectId,
    });
    return fail(`Could not generate virtual account: ${(err as Error)?.message ?? "Unknown error"}`, 502);
  }
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const projectId = params.id;

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);
  assertPermission(membership, "funding:initiate");

  const kycVerified = await isUserKycVerified(userId);
  if (!kycVerified) {
    return fail("KYC verification required before generating a virtual account.", 403);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid request body", 422);
  }

  try {
    const result = await generateVirtualAccount(projectId, parsed.data.milestoneId, userId);
    return {
      virtualAccount: {
        ...result,
        provider: result.provider,
        status: "ACTIVE",
      },
      message: "Virtual account created. Share the account number with the client to receive funds.",
    };
  } catch (err) {
    logSecurityEvent("error", "virtual_account.create_failed", {
      message: (err as Error)?.message,
      projectId,
    });
    return fail(`Could not create virtual account: ${(err as Error)?.message ?? "Unknown error"}`, 502);
  }
});
