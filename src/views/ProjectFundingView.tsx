"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, formatMinor, formatDateTime } from "@/lib/client-api";
import { Loader2 } from "lucide-react";

type FundingRecord = {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  providerTxRef: string | null;
  isSimulated: boolean;
  initiatedAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
  milestone: { id: string; title: string } | null;
};

export function ProjectFundingView({ projectId }: { projectId: string }) {
  const [records, setRecords] = useState<FundingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<{ fundingRecords: FundingRecord[] }>(`/api/projects/${projectId}/funding`).then((r) => setRecords(r.fundingRecords)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

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
        <p className="text-muted-foreground text-sm">Payment records with idempotent webhooks.</p>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No funding records yet. Create milestones and initiate funding from the Milestones tab.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction history ({records.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
