/**
 * Payment provider registry — manages all available providers.
 *
 * Live providers only (Monnify + OPay). No mock fallback — if no real provider
 * is configured, all payment-related operations will throw a clear error
 * directing the operator to configure MONNIFY_* or OPAY_* env vars.
 *
 * Configuration sources:
 *   - Environment variables (MONNIFY_*, OPAY_*) — used at server boot.
 *   - PaymentSettings table (admin-managed via /api/admin/payment-settings) —
 *     overrides env at runtime when set.
 *
 * Default provider selection:
 *   - Read PAYMENTS_DEFAULT_PROVIDER env var (default: "monnify").
 *   - If the default is enabled + configured, return it.
 *   - Otherwise, return the first enabled + configured real provider.
 *   - If none is enabled, throw.
 */
import type { PaymentProvider, PaymentProviderName } from "./provider-interface";
import { MonnifyProvider } from "./monnify-provider";
import { OpayProvider } from "./opay-provider";
import { PaymentProviderError } from "./errors";
import { db } from "@/lib/db";

let _providers: Map<PaymentProviderName, PaymentProvider> | null = null;

async function getProvidersFromDb(): Promise<{
  monnifyEnabled?: boolean;
  opayEnabled?: boolean;
  defaultProvider?: string;
} | null> {
  try {
    const settings = await db.paymentSettings.findUnique({
      where: { id: "singleton" },
      select: {
        monnifyEnabled: true,
        opayEnabled: true,
        defaultProvider: true,
      },
    });
    return settings ?? null;
  } catch {
    // DB not yet ready (e.g., during migration). Fall back to env-only.
    return null;
  }
}

function getProviders(): Map<PaymentProviderName, PaymentProvider> {
  if (_providers) return _providers;

  const map = new Map<PaymentProviderName, PaymentProvider>();

  const monnify = new MonnifyProvider();
  if (monnify.isConfigured()) {
    map.set("monnify", monnify);
  }

  const opay = new OpayProvider();
  if (opay.isConfigured()) {
    map.set("opay", opay);
  }

  _providers = map;
  return map;
}

/**
 * Reset the in-memory provider cache. Useful when admin updates
 * PaymentSettings (e.g., toggles a provider on/off, changes credentials) —
 * the next getProvider() call re-reads env + creates fresh provider instances.
 *
 * NOTE: this doesn't reset the DB-backed settings; those are read on each
 * getDefaultProvider() call via getProvidersFromDb().
 */
export function resetProviderCache(): void {
  _providers = null;
}

export function getProvider(name: PaymentProviderName): PaymentProvider {
  const providers = getProviders();
  const provider = providers.get(name);
  if (!provider) {
    throw new PaymentProviderError(
      `Payment provider '${name}' is not configured. Set the corresponding ` +
        (name === "monnify"
          ? "MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE"
          : "OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY, OPAY_PRIVATE_KEY") +
        " env vars and enable the provider.",
      503,
    );
  }
  return provider;
}

/**
 * Returns the default provider for new payments and payouts.
 *
 * Selection order:
 *   1. Default provider from PaymentSettings DB table (if set + enabled).
 *   2. PAYMENTS_DEFAULT_PROVIDER env var (default: "monnify"), if enabled.
 *   3. First enabled + configured provider (Monnify preferred over OPay).
 *   4. Throws PaymentProviderError if no provider is configured.
 *
 * This is async because it reads PaymentSettings from the DB on every call.
 */
export async function getDefaultProvider(): Promise<PaymentProvider> {
  const dbSettings = await getProvidersFromDb();
  const providers = getProviders();

  // 1. DB-configured default
  if (dbSettings?.defaultProvider) {
    const dbName = dbSettings.defaultProvider as PaymentProviderName;
    if (dbName === "monnify" || dbName === "opay") {
      const dbEnabled =
        dbName === "monnify" ? dbSettings.monnifyEnabled : dbSettings.opayEnabled;
      const provider = providers.get(dbName);
      if (provider && dbEnabled && provider.isEnabled()) {
        return provider;
      }
    }
  }

  // 2. Env-configured default
  const envDefault = (process.env.PAYMENTS_DEFAULT_PROVIDER ?? "monnify") as PaymentProviderName;
  if (envDefault === "monnify" || envDefault === "opay") {
    const provider = providers.get(envDefault);
    if (provider?.isEnabled()) {
      return provider;
    }
  }

  // 3. First enabled provider
  for (const name of ["monnify", "opay"] as PaymentProviderName[]) {
    const provider = providers.get(name);
    if (provider?.isEnabled()) {
      return provider;
    }
  }

  // 4. None configured — throw with a helpful error message.
  throw new PaymentProviderError(
    "No payment provider is configured. Configure Monnify or OPay via the " +
      "Admin → Gateway tab, or set MONNIFY_API_KEY, MONNIFY_SECRET_KEY, " +
      "MONNIFY_CONTRACT_CODE (and MONNIFY_ENABLED=true) environment variables.",
    503,
  );
}

export function listAvailableProviders(): Array<{
  name: PaymentProviderName;
  enabled: boolean;
  configured: boolean;
  environment: string;
  message: string;
}> {
  const providers = getProviders();
  const result: Array<{
    name: PaymentProviderName;
    enabled: boolean;
    configured: boolean;
    environment: string;
    message: string;
  }> = [];
  for (const [, provider] of providers) {
    const health = provider.health();
    result.push({
      name: health.name,
      enabled: health.enabled,
      configured: health.configured,
      environment: health.environment,
      message: health.message,
    });
  }
  return result;
}

/**
 * Returns true if at least one real provider is enabled + configured.
 * Used by health checks and the funding flow gate.
 */
export function isLivePaymentsEnabled(): boolean {
  const providers = getProviders();
  for (const [, provider] of providers) {
    if (provider.isEnabled()) return true;
  }
  return false;
}

/**
 * Returns true if payouts are enabled (always true if a provider is configured
 * and LIVE_PAYOUTS_ENABLED is not explicitly false).
 */
export function isLivePayoutsEnabled(): boolean {
  // LIVE_PAYOUTS_ENABLED acts as a kill-switch — defaults to true (live)
  // unless explicitly set to "false".
  return process.env.LIVE_PAYOUTS_ENABLED !== "false";
}
