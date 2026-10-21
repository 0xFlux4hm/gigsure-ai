/**
 * Payment provider registry — manages all available providers.
 *
 * Determines which provider to use based on configuration:
 *   - PAYMENTS_MODE=mock → only mock provider
 *   - PAYMENTS_MODE=live → enabled real providers
 *   - PAYMENTS_DEFAULT_PROVIDER=monnify|opay → default for new payments
 *
 * Live payments are DISABLED by default (LIVE_PAYMENTS_ENABLED=false).
 */
import type { PaymentProvider, PaymentProviderName } from "./provider-interface";
import { MonnifyProvider } from "./monnify-provider";
import { OpayProvider } from "./opay-provider";
import { MockPaymentProvider } from "./mock-payment-provider";

let _providers: Map<PaymentProviderName, PaymentProvider> | null = null;

function getProviders(): Map<PaymentProviderName, PaymentProvider> {
  if (_providers) return _providers;

  const map = new Map<PaymentProviderName, PaymentProvider>();

  // Mock provider is always available
  const mock = new MockPaymentProvider();
  map.set("mock", mock);

  // Real providers — only instantiated if they might be enabled
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

export function getProvider(name: PaymentProviderName): PaymentProvider {
  const providers = getProviders();
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Payment provider '${name}' is not configured or available.`);
  }
  return provider;
}

export function getDefaultProvider(): PaymentProvider {
  const mode = process.env.PAYMENTS_MODE ?? "mock";

  if (mode === "mock" || process.env.LIVE_PAYMENTS_ENABLED !== "true") {
    return getProvider("mock");
  }

  const defaultName = (process.env.PAYMENTS_DEFAULT_PROVIDER ?? "monnify") as PaymentProviderName;
  const providers = getProviders();

  const provider = providers.get(defaultName);
  if (provider?.isEnabled()) {
    return provider;
  }

  // Fallback to mock if no real provider is enabled
  return getProvider("mock");
}

export function listAvailableProviders(): Array<{
  name: PaymentProviderName;
  enabled: boolean;
  configured: boolean;
  environment: string;
  message: string;
}> {
  const providers = getProviders();
  const result = [];
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

export function isLivePaymentsEnabled(): boolean {
  return process.env.LIVE_PAYMENTS_ENABLED === "true";
}

export function isLivePayoutsEnabled(): boolean {
  return process.env.LIVE_PAYOUTS_ENABLED === "true";
}
