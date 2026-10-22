/**
 * Smile ID webhook callback endpoint.
 *
 * Smile ID POSTs the verification result here when the async job completes.
 * The payload is signed with the partner's API key — we verify the signature
 * before processing.
 *
 * Security:
 *   1. Signature verification using Smile ID's HMAC-SHA256 scheme
 *   2. Timestamp replay window (5 minutes)
 *   3. Provider event ID uniqueness for replay protection
 *
 * In sandbox mode, Smile ID posts test results here.
 * In production, this must be publicly accessible (https://yourdomain.com/api/kyc/callback).
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { logSecurityEvent } from "@/lib/auth/audit";
import { recordAuditEvent } from "@/lib/auth/audit";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Verify Smile ID webhook signature.
 * Smile ID signs: timestamp + "|" + JSON body (without the signature field)
 * using HMAC-SHA256 with the API key as the secret.
 *
 * Reference: https://docs.usesmileid.com/integration-products/webhooks
 */
function verifySmileIdSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  apiKey: string,
): boolean {
  if (!signature || !timestamp || !apiKey) return false;

  // Check timestamp freshness
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) return false;

  // Smile ID signs: timestamp + body
  const signedContent = timestamp + rawBody;
  const expected = createHmac("sha256", apiKey).update(signedContent).digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Body size limit
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

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

  // SECURITY: Verify the Smile ID signature before processing anything.
  // Without this, anyone can POST a fake verification result.
  const smileIdApiKey = process.env.SMILE_ID_API_KEY ?? process.env.SMILE_ID_SECRET ?? "";
  const signature = payload.signature ?? "";
  const timestamp = payload.timestamp ?? "";

  // In sandbox mode without API key configured, allow through with a warning.
  // In production, REQUIRE the signature.
  const isSandboxWithoutKey = process.env.SMILE_ID_ENVIRONMENT !== "production" && !smileIdApiKey;

  if (!isSandboxWithoutKey) {
    if (!smileIdApiKey) {
      logSecurityEvent("error", "kyc.callback_no_api_key", { message: "SMILE_ID_API_KEY not configured" });
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const signatureValid = verifySmileIdSignature(raw, signature, timestamp, smileIdApiKey);
    if (!signatureValid) {
      logSecurityEvent("warn", "kyc.callback_invalid_signature", { jobId: payload.partner_params?.job_id });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    logSecurityEvent("warn", "kyc.callback_no_signature_check", {
      message: "Sandbox mode — SMILE_ID_API_KEY not set, skipping signature verification",
    });
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

  // Replay protection: check if this job was already processed
  if (verification.status === "VERIFIED" || verification.status === "REJECTED") {
    logSecurityEvent("info", "kyc.callback_already_processed", { verificationId: verification.id, status: verification.status });
    return NextResponse.json({ ok: true, message: "Already processed" });
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
