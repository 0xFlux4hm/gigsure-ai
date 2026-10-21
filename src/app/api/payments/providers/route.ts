/** List available payment providers + health status. */
import { apiRoute } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { listAvailableProviders, isLivePaymentsEnabled } from "@/lib/payments/registry";

export const GET = apiRoute(async () => {
  await requireUserId();
  return {
    providers: listAvailableProviders(),
    livePaymentsEnabled: isLivePaymentsEnabled(),
    defaultProvider: process.env.PAYMENTS_DEFAULT_PROVIDER ?? "mock",
    mode: process.env.PAYMENTS_MODE ?? "mock",
  };
});
