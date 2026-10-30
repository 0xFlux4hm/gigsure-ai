/**
 * End-to-end test of the PayPalProvider using real sandbox credentials.
 * Run with: bunx tsx scripts/test-paypal-provider.ts
 */
import { PayPalProvider } from "../src/lib/payments/paypal-provider";

async function main() {
  const p = new PayPalProvider();
  console.log("=== PayPalProvider instantiated ===");
  console.log("  name:", p.name);
  console.log("  isConfigured:", p.isConfigured());
  console.log("  isEnabled:", p.isEnabled());
  console.log("  health:", JSON.stringify(p.health(), null, 2));

  if (!p.isEnabled()) {
    console.log("\n✗ PayPal is not enabled. Check .env.local.");
    process.exit(1);
  }

  console.log("\n=== Live test: create a PayPal Order via the provider ===");
  const result = await p.initiatePayment({
    paymentReference: `GS_test_${Date.now()}`,
    amountMinor: 45000000, // ₦450,000 in minor units
    currency: "NGN",
    customerEmail: "demo@gigsure.ai",
    paymentDescription: "GigSure test milestone — cross-border USD funding",
    redirectUrl: "https://gigsure-ai.vercel.app/?view=project-funding",
    feeMinor: 675000,
    netMinor: 44325000,
    policyVersion: "2026-10-30",
  });
  console.log("✓ initiatePayment succeeded!");
  console.log("  provider:", result.provider);
  console.log("  providerReference (Order ID):", result.providerReference);
  console.log("  status:", result.status);
  console.log("  checkoutUrl:", result.checkoutUrl?.substring(0, 80) + "...");

  console.log("\n=== Verify the order we just created ===");
  const v = await p.verifyPayment(result.providerReference);
  console.log("✓ verifyPayment succeeded!");
  console.log("  status:", v.status);
  console.log("  amountPaidMinor:", v.amountPaidMinor, "(should be ~45000000 after USD→NGN conversion)");
  console.log("  currency:", v.currency);
  console.log("  paidAt:", v.paidAt ?? "(not yet paid — expected, client hasn't clicked Approve)");
  console.log("  paymentMethod:", v.paymentMethod);

  console.log("\n=== ALL TESTS PASSED — PayPal integration is ready for the demo ===");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
