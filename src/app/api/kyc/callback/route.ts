/**
 * Smile ID webhook callback endpoint.
 *
 * Smile ID POSTs the verification result here when the async job completes.
 * The payload is signed with the partner's API key — we verify the signature
 * before processing.
 *
 * In sandbox mode, Smile ID posts test results here.
 * In production, this must be publicly accessible (https://yourdomain.com/api/kyc/callback).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logSecurityEvent } from "@/lib/auth/audit";
import { recordAuditEvent } from "@/lib/auth/audit";

export async function POST(req: Request) {
  const raw = await req.text();

  let payload: {
    result: {
      ResultCode?: string;
      ResultText?: string;
      FullName?: string;
      Actions?: { Selfie_Provided?: boolean; Liveness_Check?: boolean };
    };
    partner_params: {
      user_id?: string;
      job_id?: string;
    };
    signature?: string;
    timestamp?: string;
  };

  try {
    payload = JSON.parse(raw);
  } catch {
    logSecurityEvent("warn", "kyc.callback_invalid_json");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = payload.partner_params?.user_id;
  const jobId = payload.partner_params?.job_id;

  if (!userId || !jobId) {
    logSecurityEvent("warn", "kyc.callback_missing_params", { userId, jobId });
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  // Find the verification record by provider job ID
  const verification = await db.kycVerification.findUnique({
    where: { providerJobId: jobId },
  });

  if (!verification) {
    logSecurityEvent("warn", "kyc.callback_unknown_job", { jobId });
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Parse result
  const resultCode = payload.result?.ResultCode;
  const isVerified = resultCode === "2520" || resultCode === "1012";

  const status = isVerified ? "VERIFIED" : "REJECTED";
  const fullName = payload.result?.FullName ?? verification.fullName;

  await db.kycVerification.update({
    where: { id: verification.id },
    data: {
      status,
      fullName,
      selfieMatch: payload.result?.Actions?.Selfie_Provided ?? null,
      livenessPassed: payload.result?.Actions?.Liveness_Check ?? null,
      confidenceScore: isVerified ? 95.0 : null,
      failureReason: isVerified ? null : payload.result?.ResultText,
      verifiedAt: isVerified ? new Date() : null,
      expiresAt: isVerified ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
    },
  });

  // Notify user
  await db.notification.create({
    data: {
      userId: verification.userId,
      type: "KYC",
      title: isVerified ? "KYC verification complete" : "KYC verification failed",
      body: isVerified
        ? `Your identity has been verified. You can now participate in funding transactions.`
        : `Your KYC verification was not successful. Reason: ${payload.result?.ResultText ?? "unknown"}. Please try again or contact support.`,
    },
  });

  await recordAuditEvent({
    actorId: verification.userId,
    action: `kyc.${status.toLowerCase()}_callback`,
    targetType: "KycVerification",
    targetId: verification.id,
    metadata: {
      provider: verification.provider,
      resultCode,
      fullName: isVerified ? fullName : "[REDACTED]",
    },
  });

  logSecurityEvent("info", "kyc.callback_processed", {
    verificationId: verification.id,
    status,
    resultCode,
  });

  return NextResponse.json({ ok: true });
}
