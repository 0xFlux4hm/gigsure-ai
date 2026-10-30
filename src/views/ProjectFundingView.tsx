"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, formatMinor, formatDateTime } from "@/lib/client-api";
import {
  Loader2,
  Copy,
  Landmark,
  RefreshCw,
  Info,
  CheckCircle2,
} from "lucide-react";

type FundingRecord = {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  providerTxRef: string | null;
  initiatedAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
  milestone: { id: string; title: string } | null;
};

type VirtualAccount = {
  id?: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string;
  provider: string;
  status: string;
  expectedAmountMinor?: number | null;
  totalReceivedMinor?: number;
  expiresAt?: string | null;
  createdAt?: string;
};

export function ProjectFundingView({ projectId }: { projectId: string }) {
  const [records, setRecords] = useState<FundingRecord[]>([]);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ fundingRecords: FundingRecord[] }>(`/api/projects/${projectId}/funding`),
      api.get<{ virtualAccount?: VirtualAccount }>(`/api/projects/${projectId}/virtual-account`).catch(() => ({ virtualAccount: undefined })),
    ])
      .then(([fundingRes, vaRes]) => {
        setRecords(fundingRes.fundingRecords);
        setVirtualAccount(vaRes.virtualAccount ?? null);
      })
      .catch((err) => setError((err as Error)?.message ?? "Failed to load funding info"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerateAccount() {
    setGenerating(true);
    setError(null);
    try {
      const result = await api.post<{ virtualAccount: VirtualAccount; message?: string }>(
        `/api/projects/${projectId}/virtual-account`,
        {},
      );
      setVirtualAccount(result.virtualAccount);
    } catch (err) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message ?? "Could not generate virtual account. Try again later.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Funding &amp; payments</h1>
        <p className="text-muted-foreground text-sm">
          Fund your project by bank transfer to a dedicated virtual account. The platform holds the funds under GigSure Payment Protection until milestones are completed.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Virtual account funding card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" /> Project funding account
          </CardTitle>
          <CardDescription>
            Transfer money from any Nigerian bank to this dedicated account and it will be credited to your project automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!virtualAccount ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No funding account generated yet. Generate one to receive bank transfers for this project.
              </p>
              <Button onClick={handleGenerateAccount} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Landmark className="h-4 w-4 mr-1" />}
                Generate funding account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Account number</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-mono font-semibold tracking-wider">
                      {virtualAccount.accountNumber}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(virtualAccount.accountNumber, "number")}
                    >
                      {copied === "number" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Bank</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-medium">{virtualAccount.bankName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(virtualAccount.bankName, "bank")}
                    >
                      {copied === "bank" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-muted/30 md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Account name</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-medium">{virtualAccount.accountName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(virtualAccount.accountName, "name")}
                    >
                      {copied === "name" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {virtualAccount.expectedAmountMinor && (
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span>Expected amount: <strong>{formatMinor(virtualAccount.expectedAmountMinor ?? 0, "NGN")}</strong></span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <div>
                  Status:{" "}
                  <Badge variant={virtualAccount.status === "ACTIVE" ? "default" : "secondary"}>
                    {virtualAccount.status}
                  </Badge>
                  {virtualAccount.expiresAt && (
                    <span className="ml-2">Expires {formatDateTime(virtualAccount.expiresAt)}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={handleGenerateAccount} disabled={generating}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium mb-1">How it works</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Open your bank app or dial your bank&apos;s USSD code.</li>
                    <li>Transfer money to the account number above.</li>
                    <li>Funds land in GigSure Payment Protection within seconds.</li>
                    <li>Once confirmed, the milestone status updates to <strong>Funded</strong>.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded bg-[#003087]/10 text-[#003087] font-bold text-xs">P</span>
            Pay with PayPal — cross-border funding
          </CardTitle>
          <CardDescription>
            International clients can fund milestones in USD via PayPal.
            Funds are converted to NGN at the platform rate (demo: 1 USD = ₦1,500) and held under GigSure Payment Protection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayPalFundingCard projectId={projectId} />
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction history ({records.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No transactions yet. Generate a funding account above and transfer money to it to fund your first milestone.
            </div>
          ) : (
            <ul className="divide-y">
              {records.map((r) => (
                <li key={r.id} className="p-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{r.type}</Badge>
                      <Badge variant={r.status === "PROVIDER_CONFIRMED" ? "default" : r.status === "FAILED" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="text-sm mt-1">
                      {r.milestone?.title ?? "No milestone"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Provider: {r.provider} · Ref: {r.providerTxRef ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Initiated {formatDateTime(r.initiatedAt)}
                      {r.confirmedAt && ` · Confirmed ${formatDateTime(r.confirmedAt)}`}
                    </div>
                    {r.failureReason && (
                      <div className="text-xs text-destructive mt-1">Failure: {r.failureReason}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatMinor(r.amountMinor, r.currency)}</div>
                    <div className="text-xs text-muted-foreground">{r.currency}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
//
// Lets an international client fund a milestone in USD via PayPal sandbox.
// Funds convert to NGN at the platform demo rate (1 USD = ₦1,500) and land
// in the existing NGN escrow. The freelancer receives NGN via Monnify/OPay
// payouts — the cross-border loop is the demo centerpiece.
//
// NOTE: This component depends on PAYPAL_ENABLED + PAYPAL_CLIENT_ID +
// PAYPAL_CLIENT_SECRET being set on the server. When not configured, the
// /api/payments/initiate call returns 503 and we show a friendly message
// instead of crashing.
// ---------------------------------------------------------------------------

type Milestone = {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  status: string;
};

function PayPalFundingCard({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Demo FX rate — matches src/lib/payments/paypal-provider.ts
  const FX_RATE = 1500; // 1 USD = 1500 NGN

  useEffect(() => {
    api
      .get<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`)
      .then((res) => {
        // - DRAFT, AWAITING_FUNDING → fully fundable
        // - FUNDED → also fundable (top-up / additional funding) so the demo
        //   works even if the milestone was previously funded via NGN bank transfer
        const fundable = (res.milestones ?? []).filter((m) =>
          ["DRAFT", "AWAITING_FUNDING", "FUNDED"].includes(m.status),
        );
        setMilestones(fundable);
        if (fundable.length > 0) setSelectedId(fundable[0].id);
      })
      .catch(() => setError("Could not load milestones"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const selected = milestones.find((m) => m.id === selectedId);
  const usdAmount = selected ? (selected.amountMinor / 100 / FX_RATE).toFixed(2) : null;

  async function handlePay() {
    if (!selectedId) return;
    setPaying(true);
    setError(null);
    setCheckoutUrl(null);
    try {
      const res = await api.post<{
        checkoutUrl?: string;
        providerReference?: string;
        provider?: string;
      }>("/api/payments/initiate", {
        projectId,
        milestoneId: selectedId,
        provider: "paypal",
      });
      if (res.checkoutUrl) {
        setCheckoutUrl(res.checkoutUrl);
        // Open PayPal approval URL in a new tab so the user can complete payment
        if (typeof window !== "undefined") {
          window.open(res.checkoutUrl, "_blank", "noopener,noreferrer");
        }
      } else {
        setError("PayPal did not return a checkout URL. Check server logs.");
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? "Failed to initiate PayPal payment";
      setError(
        msg.includes("not configured")
          ? "PayPal is not configured on the server. Set PAYPAL_ENABLED=true + PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET in your environment variables."
          : msg,
      );
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading milestones…
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">
            No milestones available for PayPal funding
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            PayPal funding requires milestones in <strong>Draft</strong>, <strong>Awaiting Funding</strong>, or
            <strong> Funded</strong> status. Your project either has no milestones yet, or all milestones are
            already past the funding stage (Submitted / Approved / Released).
          </p>
          <div className="text-xs space-y-1">
            <div className="font-medium">To demo PayPal funding:</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-2">
              <li>Open the <strong>Milestones</strong> tab in the sidebar</li>
              <li>Create a new milestone with any NGN amount (e.g., ₦450,000)</li>
              <li>Return to this <strong>Funding</strong> tab</li>
              <li>The new milestone will appear in the dropdown below</li>
            </ol>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Need a quick test? Create a milestone titled "Logo design" for ₦150,000 — that converts to $100 USD via PayPal.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <label className="text-sm font-medium">Select milestone to fund</label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          disabled={paying}
        >
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} — {formatMinor(m.amountMinor, m.currency)}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">NGN amount</span>
            <span className="font-medium">{formatMinor(selected.amountMinor, "NGN")}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">FX rate (demo)</span>
            <span>1 USD = ₦{FX_RATE.toLocaleString()}</span>
          </div>
          <div className="flex justify-between mt-1 pt-1 border-t">
            <span className="font-medium">You pay (USD)</span>
            <span className="font-bold text-[#003087]">${usdAmount}</span>
          </div>
        </div>
      )}

      <Button
        onClick={handlePay}
        disabled={paying || !selectedId}
        className="w-full bg-[#003087] hover:bg-[#002469] text-white"
      >
        {paying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Opening PayPal…
          </>
        ) : (
          <>
            <span className="mr-2 inline-flex items-center justify-center h-5 w-5 rounded bg-white text-[#003087] font-bold text-xs">P</span>
            Pay ${usdAmount} with PayPal
          </>
        )}
      </Button>

      {checkoutUrl && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <div className="font-medium text-emerald-700 dark:text-emerald-300 mb-1">
            PayPal checkout opened
          </div>
          <p className="text-xs text-muted-foreground">
            Complete the payment in the PayPal tab. Once approved, the webhook will confirm the funding
            and your milestone will be marked as <strong>Funded</strong>.
          </p>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#003087] underline mt-1 inline-block"
          >
            Reopen PayPal checkout →
          </a>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">How cross-border funding works</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>International client clicks "Pay with PayPal".</li>
            <li>PayPal sandbox opens — client approves payment in USD.</li>
            <li>PayPal webhook confirms the payment on our server.</li>
            <li>Funds convert to NGN at the platform rate and enter escrow.</li>
            <li>On milestone completion, the freelancer is paid out via Monnify/OPay in NGN.</li>
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Sandbox mode: no real money moves. Uses PayPal developer test accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
