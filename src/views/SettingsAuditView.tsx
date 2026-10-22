"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, formatDateTime } from "@/lib/client-api";
import { Loader2, ScrollText, Download } from "lucide-react";
import { exportAuditLogPDF } from "@/lib/pdf/export";

type Event = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string;
  ipAddress: string | null;
  createdAt: string;
};

export function SettingsAuditView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ events: Event[] }>("/api/audit?limit=100").then((r) => setEvents(r.events)).finally(() => setLoading(false));
  }, []);

  const handleExportPDF = () => {
    exportAuditLogPDF(events as unknown as Array<Record<string, unknown>>);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" /> Audit log
          </h1>
          <p className="text-muted-foreground text-sm">Security-relevant actions taken on your account.</p>
        </div>
        {events.length > 0 && (
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent events ({events.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No events recorded yet.</div>
          ) : (
            <ul className="divide-y max-h-[600px] overflow-y-auto">
              {events.map((e) => {
                let meta: Record<string, unknown> = {};
                try { meta = JSON.parse(e.metadata || "{}"); } catch {}
                return (
                  <li key={e.id} className="p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{e.action}</Badge>
                      {e.targetType && <Badge variant="secondary" className="text-xs">{e.targetType}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                      {e.ipAddress && ` · IP ${e.ipAddress}`}
                      {e.targetId && ` · ${e.targetId.slice(0, 8)}…`}
                    </div>
                    {Object.keys(meta).length > 0 && (
                      <pre className="text-xs text-muted-foreground mt-1 bg-muted/50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(meta, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
