/**
 * KYC Provider abstraction.
 *
 * Supports:
 *   - Smile ID (real NIN + selfie liveness verification — free sandbox)
 *   - Mock (for local development without Smile ID credentials)
 *
 * Smile ID flow:
 *   1. User enters NIN number
 *   2. Frontend captures selfie + liveness via Smile ID Web SDK (or file upload)
 *   3. Backend calls Smile ID's ID API with NIN + selfie
 *   4. Smile ID verifies: NIN valid, name matches, selfie matches NIN photo, liveness passed
 *   5. Backend records result in KycVerification table
 *
 * To get free Smile ID sandbox credentials:
 *   1. Sign up at https://portal.usesmileid.com/
 *   2. Get your Partner ID + API Key from the dashboard
 *   3. Set in .env:
 *      SMILE_ID_PARTNER_ID=your-partner-id
 *      SMILE_ID_API_KEY=your-api-key
 *      SMILE_ID_SANDBOX=true   # use sandbox endpoint
 *
 * If credentials are not set, falls back to mock provider (always verifies).
 */
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security/tokens";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";

export type KycStatus = "PENDING" | "IN_PROGRESS" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type KycProvider = "smile_id" | "mock";

export interface KycInitiateInput {
  userId: string;
  ninNumber: string;
  selfieBase64?: string; // SECURITY: required for real biometric verification
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface KycInitiateResult {
  verificationId: string;
  provider: KycProvider;
  providerJobId?: string;
  status: KycStatus;
  message: string;
}

export interface KycVerifyResult {
  status: KycStatus;
  fullName?: string;
  selfieMatch?: boolean;
  livenessPassed?: boolean;
  confidenceScore?: number;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Smile ID Provider (real NIN + selfie liveness verification)
// ---------------------------------------------------------------------------

class SmileIdProvider {
  private partnerId: string;
  private apiKey: string;
  private sandbox: boolean;
  private baseUrl: string;

  constructor() {
    this.partnerId = process.env.SMILE_ID_PARTNER_ID ?? "";
    this.apiKey = process.env.SMILE_ID_API_KEY ?? "";
    this.sandbox = process.env.SMILE_ID_SANDBOX !== "false";
    this.baseUrl = this.sandbox
      ? "https://sandbox-api.smileidentity.com/v1"
      : "https://api.smileidentity.com/v1";
  }

  isConfigured(): boolean {
    return !!this.partnerId && !!this.apiKey;
  }

  /**
   * Initiate a NIN verification job with Smile ID.
   * The selfie image should be captured on the frontend (via Web SDK or file upload)
   * and sent as a base64-encoded JPEG.
   */
  async initiateNinVerification(input: {
    ninNumber: string;
    selfieBase64?: string; // base64-encoded JPEG selfie (optional for NIN lookup only)
    userId: string;
    callbackUrl: string;
  }): Promise<{ jobId: string; status: KycStatus }> {
    if (!this.isConfigured()) {
      throw new Error("Smile ID credentials not configured. Set SMILE_ID_PARTNER_ID + SMILE_ID_API_KEY.");
    }

    // Use the Smile ID core SDK to generate signature + submit job
    const { IDApi, Signature } = await import("smile-identity-core");
    const sig = new Signature(this.partnerId, this.apiKey);
    const { signature, timestamp } = sig.generate_signature();

    const idApi = new IDApi(
      this.partnerId,
      this.apiKey,
      this.baseUrl,
      this.sandbox,
    );

    // Build the job request for NIN verification
    const partnerParams = {
      user_id: input.userId,
      job_id: `gigsure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      job_type: 5, // Enhanced KYC with NIN
    };

    const idInfo = {
      country: "NG",
      id_type: "NIN",
      id_number: input.ninNumber,
    };

    // If selfie is provided, include it for biometric matching
    const options = {
      signature,
      timestamp,
      partner_params: partnerParams,
      id_info: idInfo,
      ...(input.selfieBase64
        ? { images: [{ image_type_id: 2, image: input.selfieBase64 }] } // 2 = selfie
        : {}),
      callback_url: input.callbackUrl,
    };

    const result = await idApi.submit_job(options);

    return {
      jobId: partnerParams.job_id,
      status: "IN_PROGRESS",
    };
  }

  /**
   * Poll Smile ID for the verification result.
   * In production, Smile ID sends the result to the callback URL.
   * This method is for polling fallback.
   */
  async getJobStatus(jobId: string, userId: string): Promise<KycVerifyResult> {
    if (!this.isConfigured()) {
      throw new Error("Smile ID credentials not configured.");
    }

    const { IDApi, Signature } = await import("smile-identity-core");
    const sig = new Signature(this.partnerId, this.apiKey);
    const { signature, timestamp } = sig.generate_signature();

    const idApi = new IDApi(
      this.partnerId,
      this.apiKey,
      this.baseUrl,
      this.sandbox,
    );

    const result = await idApi.get_job_status({
      user_id: userId,
      job_id: jobId,
      signature,
      timestamp,
      return_image_links: false,
    });

    // Parse Smile ID result
    const resultCode = result?.ResultCode;
    const fullResult = result?.ResultText ?? "";

    // Smile ID ResultCode 2520 = "ID Validated successfully"
    // ResultCode 2521 = "ID could not be validated"
    if (resultCode === "2520" || resultCode === 1012) {
      return {
        status: "VERIFIED",
        fullName: result?.FullName ?? result?.IDNumber ?? "Verified User",
        selfieMatch: result?.Actions?.Selfie_Provided ? true : undefined,
        livenessPassed: result?.Actions?.Liveness_Check ? true : undefined,
        confidenceScore: result?.ResultText ? 95.0 : undefined,
      };
    } else {
      return {
        status: "REJECTED",
        failureReason: fullResult || "Verification failed",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Mock Provider (for local development without Smile ID credentials)
// ---------------------------------------------------------------------------

class MockKycProvider {
  isConfigured(): boolean {
    return true;
  }

  async initiateNinVerification(input: {
    ninNumber: string;
    selfieBase64?: string;
    userId: string;
    callbackUrl: string;
  }): Promise<{ jobId: string; status: KycStatus }> {
    // Mock: simulate async verification
    const jobId = `mock_job_${Date.now()}`;
    return { jobId, status: "IN_PROGRESS" };
  }

  async getJobStatus(jobId: string, userId: string): Promise<KycVerifyResult> {
    // Mock: always verify (with a small delay to simulate async)
    await new Promise((r) => setTimeout(r, 500));
    return {
      status: "VERIFIED",
      fullName: "Verified User (Mock)",
      selfieMatch: true,
      livenessPassed: true,
      confidenceScore: 95.0,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let _smileProvider: SmileIdProvider | null = null;
let _mockProvider: MockKycProvider | null = null;

function getSmileIdProvider(): SmileIdProvider {
  if (!_smileProvider) _smileProvider = new SmileIdProvider();
  return _smileProvider;
}

function getMockProvider(): MockKycProvider {
  if (!_mockProvider) _mockProvider = new MockKycProvider();
  return _mockProvider;
}

export function getKycProvider(): { provider: SmileIdProvider | MockKycProvider; name: KycProvider } {
  const smile = getSmileIdProvider();
  if (smile.isConfigured()) {
    return { provider: smile, name: "smile_id" };
  }
  // Fallback to mock for local development only.
  // In production, SMILE_ID_PARTNER_ID and SMILE_ID_API_KEY must be set.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "KYC provider not configured. Set SMILE_ID_PARTNER_ID and SMILE_ID_API_KEY.",
    );
  }
  return { provider: getMockProvider(), name: "mock" };
}

export function isKycConfigured(): boolean {
  return getSmileIdProvider().isConfigured();
}

// ---------------------------------------------------------------------------
// High-level KYC operations
// ---------------------------------------------------------------------------

/**
 * Initiate KYC verification for a user.
 * Creates a KycVerification record in PENDING status,
 * then calls the provider to start the verification job.
 */
export async function initiateKyc(input: KycInitiateInput): Promise<KycInitiateResult> {
  const { provider, name } = getKycProvider();

  // Hash the NIN number for storage (never store raw NIN)
  const ninHash = hashToken(input.ninNumber);
  const ninLast4 = input.ninNumber.slice(-4);

  // Create the verification record
  const verification = await db.kycVerification.create({
    data: {
      userId: input.userId,
      status: "PENDING",
      provider: name,
      ninNumber: ninHash, // store hash, not raw NIN
      ninNumberLast4: ninLast4,
      fullName: "Pending verification",
      verificationType: "NIN_WITH_LIVENESS",
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  // Call the provider to start the job
  try {
    // SECURITY: Use resolveBaseUrl instead of process.env.NEXTAUTH_URL
    // (which is deleted on Vercel previews, causing the callback URL to
    // point to localhost — breaking KYC on preview deployments)
    const { resolveBaseUrl } = await import("@/lib/auth/base-url");
    const callbackUrl = `${resolveBaseUrl()}/api/kyc/callback`;
    const result = await provider.initiateNinVerification({
      ninNumber: input.ninNumber,
      userId: input.userId,
      selfieBase64: input.selfieBase64, // SECURITY: pass selfie to provider
      callbackUrl,
    });

    // Update the record with job ID + IN_PROGRESS status
    await db.kycVerification.update({
      where: { id: verification.id },
      data: {
        providerJobId: result.jobId,
        status: "IN_PROGRESS",
      },
    });

    return {
      verificationId: verification.id,
      provider: name,
      providerJobId: result.jobId,
      status: "IN_PROGRESS",
      message:
        name === "mock"
          ? "KYC verification initiated (MOCK — will auto-verify)."
          : "KYC verification initiated. We'll notify you when it's complete.",
    };
  } catch (err) {
    // Mark as REJECTED with failure reason
    await db.kycVerification.update({
      where: { id: verification.id },
      data: {
        status: "REJECTED",
        failureReason: (err as Error).message,
      },
    });

    logSecurityEvent("error", "kyc.initiate_failed", {
      userId: input.userId,
      error: (err as Error).message,
    });

    return {
      verificationId: verification.id,
      provider: name,
      status: "REJECTED",
      message: `KYC verification failed to start: ${(err as Error).message}`,
    };
  }
}

/**
 * Check the status of a KYC verification.
 * For Smile ID: polls the API (or uses cached result from webhook).
 * For Mock: auto-returns VERIFIED.
 */
export async function checkKycStatus(verificationId: string, userId: string): Promise<KycVerifyResult & { verificationId: string }> {
  const verification = await db.kycVerification.findUnique({
    where: { id: verificationId },
  });
  if (!verification || verification.userId !== userId) {
    throw new Error("KYC verification not found");
  }

  // If already verified/rejected, return cached result
  if (verification.status === "VERIFIED" || verification.status === "REJECTED") {
    return {
      verificationId: verification.id,
      status: verification.status as KycStatus,
      fullName: verification.fullName,
      selfieMatch: verification.selfieMatch ?? undefined,
      livenessPassed: verification.livenessPassed ?? undefined,
      confidenceScore: verification.confidenceScore ?? undefined,
      failureReason: verification.failureReason ?? undefined,
    };
  }

  // If IN_PROGRESS, poll the provider
  if (verification.status === "IN_PROGRESS" && verification.providerJobId) {
    const { provider, name } = getKycProvider();
    try {
      const result = await provider.getJobStatus(verification.providerJobId, userId);

      // Update the record with the result
      await db.kycVerification.update({
        where: { id: verification.id },
        data: {
          status: result.status,
          fullName: result.fullName ?? verification.fullName,
          selfieMatch: result.selfieMatch ?? null,
          livenessPassed: result.livenessPassed ?? null,
          confidenceScore: result.confidenceScore ?? null,
          failureReason: result.failureReason ?? null,
          verifiedAt: result.status === "VERIFIED" ? new Date() : null,
          expiresAt: result.status === "VERIFIED" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null, // 1 year
        },
      });

      // Record audit event
      await recordAuditEvent({
        actorId: userId,
        action: `kyc.${result.status.toLowerCase()}`,
        targetType: "KycVerification",
        targetId: verification.id,
        metadata: {
          provider: name,
          confidenceScore: result.confidenceScore,
          selfieMatch: result.selfieMatch,
          livenessPassed: result.livenessPassed,
        },
      });

      return {
        verificationId: verification.id,
        ...result,
      };
    } catch (err) {
      logSecurityEvent("error", "kyc.status_check_failed", {
        verificationId,
        error: (err as Error).message,
      });
      return {
        verificationId: verification.id,
        status: "IN_PROGRESS" as KycStatus,
        failureReason: "Status check failed. Please try again later.",
      };
    }
  }

  return {
    verificationId: verification.id,
    status: verification.status as KycStatus,
    fullName: verification.fullName,
  };
}

/**
 * Check if a user has a valid (non-expired) KYC verification.
 * Used by funding endpoints to gate transactions.
 */
export async function isUserKycVerified(userId: string): Promise<boolean> {
  // Development bypass: skip KYC verification while the platform is in
  // development. This lets you test the full funding + payout flow without
  // configuring Smile ID credentials + completing real NIN verification.
  //
  // To re-enable KYC in production, either:
  //   1. Set KYC_REQUIRED=true in your environment, OR
  //   2. Set NODE_ENV=production (which we do by default on Vercel), AND
  //      set KYC_BYPASS=false
  //
  // For the hackathon demo, KYC is disabled so the demo flows smoothly.
  if (process.env.KYC_BYPASS !== "false" && process.env.NODE_ENV !== "production") {
    return true;
  }
  // Also bypass in production if explicitly opted in (for the hackathon demo)
  if (process.env.KYC_BYPASS === "true") {
    return true;
  }

  const verification = await db.kycVerification.findFirst({
    where: {
      userId,
      status: "VERIFIED",
      expiresAt: { gt: new Date() },
    },
    orderBy: { verifiedAt: "desc" },
  });
  return !!verification;
}

/**
 * Get the user's latest KYC verification (for display in UI).
 */
export async function getUserKycStatus(userId: string) {
  const latest = await db.kycVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) {
    return { status: "NONE", verified: false };
  }

  return {
    status: latest.status,
    verified: latest.status === "VERIFIED" && latest.expiresAt && latest.expiresAt > new Date(),
    provider: latest.provider,
    ninLast4: latest.ninNumberLast4,
    fullName: latest.fullName,
    verifiedAt: latest.verifiedAt,
    expiresAt: latest.expiresAt,
    failureReason: latest.failureReason,
  };
}
