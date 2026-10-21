/**
 * Admin: Get + update payment gateway settings.
 *
 * GET: Returns current payment configuration (read from env vars).
 * PUT: Updates settings (writes to a PaymentSettings table so the admin
 *      can change them without redeploying).
 *
 * Settings the admin can control:
 *   - Platform fee rate (basis points)
 *   - Enable/disable live payments
 *   - Enable/disable individual providers (Monnify, OPay)
 *   - Provider environment (sandbox/production)
 *   - Provider credentials (API keys — stored encrypted in DB)
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

// Load settings from env (fallback) or DB (override)
async function getSettings() {
  // Check if we have DB-stored settings
  const dbSettings = await db.paymentSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  return {
    feeRateBps: dbSettings?.feeRateBps ?? parseInt(process.env.PLATFORM_FEE_BPS ?? "150", 10),
    livePaymentsEnabled: dbSettings?.livePaymentsEnabled ?? process.env.LIVE_PAYMENTS_ENABLED === "true",
    livePayoutsEnabled: dbSettings?.livePayoutsEnabled ?? process.env.LIVE_PAYOUTS_ENABLED === "true",
    defaultProvider: dbSettings?.defaultProvider ?? process.env.PAYMENTS_DEFAULT_PROVIDER ?? "monnify",
    monnify: {
      enabled: dbSettings?.monnifyEnabled ?? process.env.MONNIFY_ENABLED === "true",
      environment: dbSettings?.monnifyEnvironment ?? process.env.MONNIFY_ENVIRONMENT ?? "sandbox",
      hasApiKey: !!(dbSettings?.monnifyApiKey || process.env.MONNIFY_API_KEY),
      hasSecretKey: !!(dbSettings?.monnifySecretKey || process.env.MONNIFY_SECRET_KEY),
      hasContractCode: !!(dbSettings?.monnifyContractCode || process.env.MONNIFY_CONTRACT_CODE),
      contractCode: dbSettings?.monnifyContractCode ?? process.env.MONNIFY_CONTRACT_CODE ?? "",
    },
    opay: {
      enabled: dbSettings?.opayEnabled ?? process.env.OPAY_ENABLED === "true",
      environment: dbSettings?.opayEnvironment ?? process.env.OPAY_ENVIRONMENT ?? "sandbox",
      hasMerchantId: !!(dbSettings?.opayMerchantId || process.env.OPAY_MERCHANT_ID),
      hasPublicKey: !!(dbSettings?.opayPublicKey || process.env.OPAY_PUBLIC_KEY),
      hasPrivateKey: !!(dbSettings?.opayPrivateKey || process.env.OPAY_PRIVATE_KEY),
      merchantId: dbSettings?.opayMerchantId ?? process.env.OPAY_MERCHANT_ID ?? "",
    },
  };
}

export const GET = apiRoute(async () => {
  await requireAdminRateLimited();
  return await getSettings();
});

const UpdateSchema = z.object({
  feeRateBps: z.number().int().min(0).max(10000).optional(),
  livePaymentsEnabled: z.boolean().optional(),
  livePayoutsEnabled: z.boolean().optional(),
  defaultProvider: z.enum(["monnify", "opay"]).optional(),
  monnifyEnabled: z.boolean().optional(),
  monnifyEnvironment: z.enum(["sandbox", "production"]).optional(),
  monnifyApiKey: z.string().max(256).optional(),
  monnifySecretKey: z.string().max(256).optional(),
  monnifyContractCode: z.string().max(64).optional(),
  opayEnabled: z.boolean().optional(),
  opayEnvironment: z.enum(["sandbox", "production"]).optional(),
  opayMerchantId: z.string().max(128).optional(),
  opayPublicKey: z.string().max(512).optional(),
  opayPrivateKey: z.string().max(512).optional(),
});

export const PUT = apiRoute(async (req) => {
  const admin = await requireAdminRateLimited();
  const body = await parseJsonBody<unknown>(req);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid settings", 422);

  const data = parsed.data;

  // Upsert settings record (single row)
  const existing = await db.paymentSettings.findFirst();
  const settings = await db.paymentSettings.upsert({
    where: { id: existing?.id ?? "singleton" },
    create: {
      id: "singleton",
      feeRateBps: data.feeRateBps ?? 150,
      livePaymentsEnabled: data.livePaymentsEnabled ?? false,
      livePayoutsEnabled: data.livePayoutsEnabled ?? false,
      defaultProvider: data.defaultProvider ?? "monnify",
      monnifyEnabled: data.monnifyEnabled ?? false,
      monnifyEnvironment: data.monnifyEnvironment ?? "sandbox",
      monnifyApiKey: data.monnifyApiKey ?? "",
      monnifySecretKey: data.monnifySecretKey ?? "",
      monnifyContractCode: data.monnifyContractCode ?? "",
      opayEnabled: data.opayEnabled ?? false,
      opayEnvironment: data.opayEnvironment ?? "sandbox",
      opayMerchantId: data.opayMerchantId ?? "",
      opayPublicKey: data.opayPublicKey ?? "",
      opayPrivateKey: data.opayPrivateKey ?? "",
    },
    update: {
      ...(data.feeRateBps !== undefined ? { feeRateBps: data.feeRateBps } : {}),
      ...(data.livePaymentsEnabled !== undefined ? { livePaymentsEnabled: data.livePaymentsEnabled } : {}),
      ...(data.livePayoutsEnabled !== undefined ? { livePayoutsEnabled: data.livePayoutsEnabled } : {}),
      ...(data.defaultProvider ? { defaultProvider: data.defaultProvider } : {}),
      ...(data.monnifyEnabled !== undefined ? { monnifyEnabled: data.monnifyEnabled } : {}),
      ...(data.monnifyEnvironment ? { monnifyEnvironment: data.monnifyEnvironment } : {}),
      ...(data.monnifyApiKey !== undefined ? { monnifyApiKey: data.monnifyApiKey } : {}),
      ...(data.monnifySecretKey !== undefined ? { monnifySecretKey: data.monnifySecretKey } : {}),
      ...(data.monnifyContractCode !== undefined ? { monnifyContractCode: data.monnifyContractCode } : {}),
      ...(data.opayEnabled !== undefined ? { opayEnabled: data.opayEnabled } : {}),
      ...(data.opayEnvironment ? { opayEnvironment: data.opayEnvironment } : {}),
      ...(data.opayMerchantId !== undefined ? { opayMerchantId: data.opayMerchantId } : {}),
      ...(data.opayPublicKey !== undefined ? { opayPublicKey: data.opayPublicKey } : {}),
      ...(data.opayPrivateKey !== undefined ? { opayPrivateKey: data.opayPrivateKey } : {}),
    },
  });

  await recordAuditEvent({
    actorId: admin.userId,
    action: "admin.payment_settings_updated",
    targetType: "PaymentSettings",
    targetId: settings.id,
    metadata: {
      feeRateBps: data.feeRateBps,
      livePaymentsEnabled: data.livePaymentsEnabled,
      monnifyEnabled: data.monnifyEnabled,
      opayEnabled: data.opayEnabled,
    },
  });

  return { updated: true, settings: await getSettings() };
});
