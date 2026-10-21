/** Calculate fee breakdown for a given amount (preview before payment). */
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { calculatePaymentBreakdown } from "@/lib/payments/fee-calculator";
import { z } from "zod";

const Schema = z.object({
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().max(8).default("NGN"),
});

export const POST = apiRoute(async (req) => {
  await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422);

  const breakdown = calculatePaymentBreakdown(parsed.data.amountMinor);
  return {
    grossMinor: breakdown.grossMinor,
    feeMinor: breakdown.feeMinor,
    netMinor: breakdown.netMinor,
    feeRate: `${breakdown.rateBps / 100}%`,
    feeRateBps: breakdown.rateBps,
    feePayer: "freelancer",
    policyVersion: breakdown.policyVersion,
    currency: parsed.data.currency,
  };
});
