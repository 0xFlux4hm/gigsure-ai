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
