import { PayPalProvider } from "../src/lib/payments/paypal-provider";

async function main() {
  const p = new PayPalProvider();
  console.log("Testing verifyPayment on already-captured order 6TT90590D6008261L...");
  try {
    const result = await p.verifyPayment("6TT90590D6008261L");
    console.log("");
    console.log("=== Result ===");
    console.log("  status:", result.status);
    console.log("  amountPaidMinor:", result.amountPaidMinor);
    console.log("  currency:", result.currency);
    console.log("  paidAt:", result.paidAt);
    console.log("  paymentMethod:", result.paymentMethod);
    console.log("  providerReference:", result.providerReference);
    if (result.status === "SUCCEEDED") {
      console.log("");
      console.log("✅ verifyPayment returns SUCCEEDED — the verify endpoint will work!");
    } else {
      console.log("");
      console.log("❌ verifyPayment did not return SUCCEEDED — status was", result.status);
    }
  } catch (err) {
    console.log("❌ Error:", (err as Error)?.message);
  }
}

main().catch(console.error);
