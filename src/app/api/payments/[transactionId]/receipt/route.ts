import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export const GET = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const { transactionId } = await params;

  // The URL param might be either:
  // - A PaymentTransaction ID (CUID like 'clxxx...')
  // - A providerTxRef (PayPal order ID like '3UH33236RW5487452')
  // Try looking up by ID first, then by providerReference.
  let transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    include: {
      project: { select: { title: true, currency: true } },
      milestone: { select: { title: true } },
      user: { select: { displayName: true, email: true } },
    },
  });

  // If not found by ID, try by providerReference (PayPal order ID)
  if (!transaction) {
    transaction = await db.paymentTransaction.findFirst({
      where: { providerReference: transactionId },
      include: {
        project: { select: { title: true, currency: true } },
        milestone: { select: { title: true } },
        user: { select: { displayName: true, email: true } },
      },
    });
  }

  // Fallback: find the most recent SUCCEEDED PayPal transaction for this user
  if (!transaction) {
    transaction = await db.paymentTransaction.findFirst({
      where: { userId, provider: "paypal", status: "SUCCEEDED" },
      include: {
        project: { select: { title: true, currency: true } },
        milestone: { select: { title: true } },
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { paidAt: "desc" },
    });
  }

  if (!transaction) return fail("Transaction not found", 404);
  if (transaction.userId !== userId) return fail("Unauthorized", 403);
  if (transaction.status !== "SUCCEEDED") {
    return fail("Receipt is only available for confirmed payments", 400);
  }

  const fundingRecord = await db.fundingRecord.findFirst({
    where: {
      milestoneId: transaction.milestoneId,
      projectId: transaction.projectId,
      status: "PROVIDER_CONFIRMED",
    },
    orderBy: { confirmedAt: "desc" },
    select: { id: true, status: true, confirmedAt: true },
  });

  const receiptNumber = `GS-RCPT-${transaction.id.slice(-8).toUpperCase()}`;
  const paidAt = transaction.paidAt ? new Date(transaction.paidAt) : new Date();
  const isPayPal = transaction.provider === "paypal";
  const fxRate = 1500;
  const usdAmount = isPayPal ? (transaction.amountMinor / fxRate / 100).toFixed(2) : null;
  const ngnAmount = (transaction.amountMinor / 100).toFixed(2);
  const feeAmount = (transaction.feeMinor / 100).toFixed(2);
  const netAmount = (transaction.netMinor / 100).toFixed(2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${receiptNumber} — GigSure AI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 20px; }
  .receipt { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #003087 0%, #002469 100%); color: white; padding: 32px; text-align: center; }
  .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .logo span { color: #4ade80; }
  .receipt-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; margin-top: 4px; }
  .receipt-number { font-size: 28px; font-weight: 700; margin-top: 8px; }
  .status-badge { display: inline-block; background: #22c55e; color: white; padding: 4px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 12px; }
  .body { padding: 32px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 12px; font-weight: 600; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .row:last-child { border-bottom: none; }
  .label { color: #6b7280; font-size: 14px; }
  .value { font-weight: 600; font-size: 14px; }
  .amount-box { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .amount-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
  .amount-label { color: #6b7280; font-size: 14px; }
  .amount-value { font-size: 18px; font-weight: 700; }
  .amount-value.primary { font-size: 32px; color: #003087; }
  .divider { height: 1px; background: #e5e7eb; margin: 12px 0; }
  .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center; }
  .footer p { font-size: 12px; color: #9ca3af; line-height: 1.6; }
  .footer .brand { font-weight: 700; color: #003087; }
  .print-btn { display: block; width: 100%; max-width: 300px; margin: 20px auto 0; padding: 14px; background: #003087; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
  .print-btn:hover { background: #002469; }
  .provider-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .provider-paypal { background: #00308715; color: #003087; }
  .provider-monnify { background: #4ade8015; color: #16a34a; }
  .provider-opay { background: #0ea5e915; color: #0ea5e9; }
  @media print { body { background: white; padding: 0; } .receipt { box-shadow: none; max-width: 100%; } .print-btn { display: none; } }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="logo">GigSure<span> AI</span></div>
    <div class="receipt-label">Payment Receipt</div>
    <div class="receipt-number">${receiptNumber}</div>
    <div class="status-badge">✓ Payment Confirmed</div>
  </div>
  <div class="body">
    <div class="section">
      <div class="section-title">Transaction Details</div>
      <div class="row"><span class="label">Date</span><span class="value">${paidAt.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}</span></div>
      <div class="row"><span class="label">Time</span><span class="value">${paidAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })} WAT</span></div>
      <div class="row"><span class="label">Reference</span><span class="value">${transaction.paymentReference}</span></div>
      <div class="row"><span class="label">Provider</span><span class="value"><span class="provider-badge provider-${transaction.provider}">${transaction.provider.toUpperCase()}</span></span></div>
      ${transaction.providerReference ? `<div class="row"><span class="label">${isPayPal ? "PayPal Order ID" : "Provider Ref"}</span><span class="value">${transaction.providerReference}</span></div>` : ""}
    </div>
    <div class="section">
      <div class="section-title">Project & Milestone</div>
      <div class="row"><span class="label">Project</span><span class="value">${transaction.project.title}</span></div>
      <div class="row"><span class="label">Milestone</span><span class="value">${transaction.milestone?.title ?? "—"}</span></div>
    </div>
    <div class="section">
      <div class="section-title">Payment Breakdown</div>
      <div class="amount-box">
        ${isPayPal ? `
        <div class="amount-row"><span class="amount-label">Amount Paid (USD)</span><span class="amount-value primary">$${usdAmount}</span></div>
        <div class="amount-row"><span class="amount-label">FX Rate (demo)</span><span class="amount-value">1 USD = N${fxRate.toLocaleString()}</span></div>
        <div class="divider"></div>` : ""}
        <div class="amount-row"><span class="amount-label">Milestone Amount (NGN)</span><span class="amount-value primary">N${ngnAmount}</span></div>
        <div class="amount-row"><span class="amount-label">Platform Fee (1.5%)</span><span class="amount-value">N${feeAmount}</span></div>
        <div class="divider"></div>
        <div class="amount-row"><span class="amount-label">Net to Freelancer</span><span class="amount-value" style="color: #16a34a;">N${netAmount}</span></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Paid By</div>
      <div class="row"><span class="label">Name</span><span class="value">${transaction.user.displayName}</span></div>
      <div class="row"><span class="label">Email</span><span class="value">${transaction.user.email}</span></div>
    </div>
    ${fundingRecord?.confirmedAt ? `
    <div class="section">
      <div class="section-title">Escrow Confirmation</div>
      <div class="row"><span class="label">Funding Record</span><span class="value">${fundingRecord.id.slice(-8).toUpperCase()}</span></div>
      <div class="row"><span class="label">Status</span><span class="value" style="color: #16a34a;">${fundingRecord.status}</span></div>
      <div class="row"><span class="label">Confirmed At</span><span class="value">${new Date(fundingRecord.confirmedAt).toLocaleString("en-NG")}</span></div>
    </div>` : ""}
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="footer">
    <p><span class="brand">GigSure AI</span> — Trust infrastructure for Africa's independent services market</p>
    <p>This receipt confirms payment has been received and held under GigSure Payment Protection.</p>
    <p>Funds will be released to the service provider upon milestone completion.</p>
    <p style="margin-top: 8px;">Receipt ID: ${receiptNumber} Generated: ${new Date().toISOString()}</p>
  </div>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
