"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, formatDateTime, timeAgo } from "@/lib/client-api";
import { Loader2, ScrollText, Download, ChevronDown, ChevronRight } from "lucide-react";
import { exportAuditLogPDF } from "@/lib/pdf/export";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";
import { translateAuditAction, translateMetadata, type AuditCategory } from "@/lib/audit/audit-translator";

type Event = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string;
  ipAddress: string | null;
  createdAt: string;
};

const TONE_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  destructive: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export function SettingsAuditView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    api.get<{ events: Event[] }>("/api/audit?limit=100")
      .then((r) => setEvents(r.events))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportPDF = () => {
    exportAuditLogPDF(events as unknown as Array<Record<string, unknown>>);
  };

  // Get unique categories from events
  const categories = Array.from(new Set(events.map((e) => translateAuditAction(e.action).category)));

  const filteredEvents = categoryFilter === "ALL"
    ? events
    : events.filter((e) => translateAuditAction(e.action).category === categoryFilter);

  if (loading) return <LoadingState label="Loading activity…" />;

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Account activity"
        description="A record of actions taken on your account."
        icon={ScrollText}
        actions={
          events.length > 0 ? (
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          ) : null
        }
      />

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === "ALL"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            All ({events.length})
          </button>
          {categories.map((cat) => {
            const count = events.filter((e) => translateAuditAction(e.action).category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Activity timeline */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No activity yet"
          description="Actions taken on your account will appear here."
        />
      ) : (
        <Card className="premium-card">
          <CardContent className="p-0">
            <ul className="divide-y max-h-[600px] overflow-y-auto">
              {filteredEvents.map((e) => {
                const info = translateAuditAction(e.action);
                const details = translateMetadata(e.metadata);
                const isExpanded = expanded.has(e.id);
                const Icon = info.icon;

                return (
                  <li key={e.id} className="p-3">
                    <button
                      onClick={() => toggleExpand(e.id)}
                      className="w-full flex items-start gap-3 text-left"
                    >
                      {/* Icon */}
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${TONE_STYLES[info.tone]}`}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{info.title}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(e.createdAt)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{info.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground/70">{formatDateTime(e.createdAt)}</span>
                          {e.ipAddress && (
                            <span className="text-[10px] text-muted-foreground/70">· IP {e.ipAddress}</span>
                          )}
                          {details.length > 0 && (
                            <span className="text-[10px] text-primary flex items-center gap-0.5">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {details.length} detail{details.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expandable details */}
                    {isExpanded && details.length > 0 && (
                      <div className="mt-2 ml-12 space-y-1">
                        {details.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-medium min-w-[100px]">{d.label}:</span>
                            <span className="text-foreground">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
