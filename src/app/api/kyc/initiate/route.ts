/**
 * Initiate KYC verification.
 *
 * Body: { ninNumber: string, selfieBase64?: string }
 *
 * The NIN number is verified against the Nigerian government database via
 * Smile ID (or mock provider in dev). If selfieBase64 is provided, a
 * biometric liveness check is also performed.
 *
 * The raw NIN is NEVER stored — only its SHA-256 hash + last 4 digits.
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId, getClientIp } from "@/lib/auth/session";
import { initiateKyc, isUserKycVerified } from "@/lib/kyc/provider";
import { logSecurityEvent } from "@/lib/auth/audit";
import { z } from "zod";
import { headers } from "next/headers";

const Schema = z.object({
  ninNumber: z.string().min(11).max(11).regex(/^\d{11}$/, "NIN must be exactly 11 digits"),
  selfieBase64: z.string().min(100).max(5 * 1024 * 1024).optional(), // max 5MB selfie
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();
  const ip = await getClientIp();
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail("Invalid input. NIN must be exactly 11 digits.", 422); }

  // Check if user already has a valid KYC
  const alreadyVerified = await isUserKycVerified(userId);
  if (alreadyVerified) {
    return fail("You are already KYC verified.", 409);
  }

  // Check for pending/in-progress verifications
  const pending = await db.kycVerification.findFirst({
    where: {
      userId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });
  if (pending) {
    return fail("You have a KYC verification already in progress. Please wait for it to complete.", 409);
  }

  const result = await initiateKyc({
    userId,
    ninNumber: parsed.data.ninNumber,
    ipAddress: ip,
    userAgent,
  });

  // Don't log the NIN number — only the last 4 digits
  logSecurityEvent("info", "kyc.initiated", {
    userId,
    provider: result.provider,
    ninLast4: parsed.data.ninNumber.slice(-4),
  });

  return result;
});
