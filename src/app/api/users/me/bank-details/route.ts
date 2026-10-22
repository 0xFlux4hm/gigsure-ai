/**
 * Manage the current user's payout bank accounts.
 *
 * GET  /api/users/me/bank-details           — list current user's bank accounts
 * POST /api/users/me/bank-details           — add a new bank account
 *   Body: { accountName, accountNumber, bankCode, bankName, currency?, isDefault? }
 *
 * Worker must have KYC verification before adding bank details — the
 * accountName should match the KYC name. We don't enforce exact match here
 * (because bank-side name can have format differences) but the worker must
 * have completed KYC.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { isUserKycVerified } from "@/lib/kyc/provider";
import { getDefaultProvider } from "@/lib/payments/registry";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  accountName: z.string().min(2).max(120),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
  bankCode: z.string().min(2).max(10),
  bankName: z.string().min(2).max(120),
  currency: z.string().length(3).default("NGN"),
  isDefault: z.boolean().optional(),
});

export const GET = apiRoute(async () => {
  const userId = await requireUserId();

  const bankDetails = await db.bankDetail.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return {
    bankDetails: bankDetails.map((bd) => ({
      id: bd.id,
      accountName: bd.accountName,
      accountNumber: bd.accountNumber,
      bankCode: bd.bankCode,
      bankName: bd.bankName,
      currency: bd.currency,
      isDefault: bd.isDefault,
      isVerified: bd.isVerified,
      verifiedAt: bd.verifiedAt,
      createdAt: bd.createdAt,
    })),
  };
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  // Require KYC — can't add a payout account without identity verification.
  const kycVerified = await isUserKycVerified(userId);
  if (!kycVerified) {
    return fail(
      "KYC verification required before adding a payout bank account. Please complete KYC verification in your account settings.",
      403,
    );
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    logSecurityEvent("warn", "api.validation_failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return fail("Invalid bank account details", 422);
  }

  const { accountName, accountNumber, bankCode, bankName, currency, isDefault } = parsed.data;

  // Defense-in-depth: enforce uniqueness per (user, accountNumber, bankCode)
  const existing = await db.bankDetail.findUnique({
    where: {
      userId_accountNumber_bankCode: { userId, accountNumber, bankCode },
    },
    select: { id: true },
  });
  if (existing) {
    return fail("This bank account is already registered on your profile.", 409);
  }

  // Try a name enquiry against the provider to flag isVerified.
  // Don't fail the whole request if the enquiry fails — just mark as not verified.
  let isVerified = false;
  let enquiryRef: string | undefined;
  try {
    const provider = await getDefaultProvider();
    if (provider.resolveAccountName) {
      const enquiry = await provider.resolveAccountName({ accountNumber, bankCode });
      if (enquiry.valid && enquiry.accountName) {
        const normalizedExpected = accountName.toLowerCase().trim();
        const normalizedReturned = enquiry.accountName.toLowerCase().trim();

        // SECURITY: Reject empty/whitespace-only bank-returned names
        // (previously: "".includes(anything) = true → always verified)
        if (normalizedReturned.length < 2 || normalizedExpected.length < 2) {
          isVerified = false;
        } else {
          // SECURITY: Use stricter matching — require the shorter name to be
          // a substring of the longer one, with minimum 3-char overlap.
          // This prevents "A" matching "JOHN SMITH" via includes("A").
          const shorter = normalizedExpected.length <= normalizedReturned.length
            ? normalizedExpected
            : normalizedReturned;
          const longer = normalizedExpected.length <= normalizedReturned.length
            ? normalizedReturned
            : normalizedExpected;
          // Require the shorter name to be at least 3 chars and be a substring
          isVerified = shorter.length >= 3 && longer.includes(shorter);
        }
        enquiryRef = enquiry.enquiryReference;
      }
    }
  } catch (err) {
    // Name enquiry is best-effort — don't reject the whole request.
    logSecurityEvent("warn", "bank.name_enquiry_failed", {
      message: (err as Error)?.message,
      bankCode,
    });
  }

  // If isDefault, unset any existing default for this user first.
  const result = await db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.bankDetail.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.bankDetail.create({
      data: {
        userId,
        accountName,
        accountNumber,
        bankCode,
        bankName,
        currency,
        isDefault: isDefault ?? false,
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
        verificationRef: enquiryRef,
      },
    });
  });

  await recordAuditEvent({
    actorId: userId,
    action: "bank_detail.added",
    targetType: "BankDetail",
    targetId: result.id,
    metadata: { bankCode, last4: accountNumber.slice(-4), verified: isVerified },
  });

  return {
    bankDetail: {
      id: result.id,
      accountName: result.accountName,
      accountNumber: result.accountNumber,
      bankCode: result.bankCode,
      bankName: result.bankName,
      isDefault: result.isDefault,
      isVerified: result.isVerified,
    },
    message: isVerified
      ? "Bank account added and verified via name enquiry."
      : "Bank account added but name enquiry could not verify ownership. Payouts may require manual review.",
  };
});
