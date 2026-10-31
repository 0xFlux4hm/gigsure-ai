"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { Shield, Loader2, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type RiskFlag = {
  clause: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  recommendation: string;
};

type RiskAnalysis = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  flags: RiskFlag[];
  summary: string;
};

const severityStyles = {
  LOW: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    icon: CheckCircle2,
    iconColor: "text-blue-500",
  },
  MEDIUM: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    icon: AlertCircle,
    iconColor: "text-amber-500",
  },
  HIGH: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    icon: AlertTriangle,
    iconColor: "text-red-500",
  },
};

const riskLevelStyles = {
  LOW: {
    gradient: "from-emerald-500 to-green-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Low Risk",
  },
  MEDIUM: {
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "Medium Risk",
  },
  HIGH: {
    gradient: "from-red-500 to-rose-500",
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    label: "High Risk",
  },
};

export function ContractRiskAnalyzer({ contractVersionId }: { contractVersionId: string }) {
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<RiskAnalysis>("/api/ai/contract-risk", {
        contractVersionId,
      });
      setAnalysis(result);
      toast.success("Risk analysis complete", { description: `Score: ${result.score}/100 — ${result.riskLevel.toLowerCase()} risk.` });
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to analyze contract");
      toast.error("Risk analysis failed", { description: (err as Error)?.message ?? "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  // Score gauge color based on value
  const scoreColor =
    analysis && analysis.score <= 30 ? "text-emerald-500"
    : analysis && analysis.score <= 65 ? "text-amber-500"
    : "text-red-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Risk Analysis</span>
        </div>
        {!analysis && !loading && (
          <Button size="sm" variant="outline" onClick={analyze}>
            <Shield className="mr-2 h-3.5 w-3.5" /> Analyze risks
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> AI is reviewing the contract...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-3">
          {/* Score gauge */}
          <div className={`rounded-lg ${riskLevelStyles[analysis.riskLevel].bg} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Risk Score</span>
              <Badge className={riskLevelStyles[analysis.riskLevel].text + " " + riskLevelStyles[analysis.riskLevel].bg}>
                {riskLevelStyles[analysis.riskLevel].label}
              </Badge>
            </div>
            <div className="flex items-end gap-2">
              <span className={`text-5xl font-bold ${scoreColor}`}>{analysis.score}</span>
              <span className="text-lg text-muted-foreground mb-1">/ 100</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${riskLevelStyles[analysis.riskLevel].gradient} transition-all`}
                style={{ width: `${analysis.score}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{analysis.summary}</p>
          </div>

          {/* Flag list */}
          {analysis.flags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {analysis.flags.length} risk{analysis.flags.length === 1 ? "" : "s"} found
              </div>
              {analysis.flags.map((flag, i) => {
                const style = severityStyles[flag.severity];
                const Icon = style.icon;
                return (
                  <div key={i} className="rounded-md border p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${style.iconColor} shrink-0`} />
                      <span className="font-medium text-sm">{flag.clause}</span>
                      <Badge className={`text-xs ${style.badge}`}>{flag.severity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{flag.reason}</p>
                    <p className="text-xs pl-6">
                      <span className="font-medium">Recommendation: </span>
                      {flag.recommendation}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {analysis.flags.length === 0 && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 inline mr-2" />
              No major risks detected. Contract terms appear standard.
            </div>
          )}

          <div className="text-xs text-muted-foreground italic">
            AI-generated. Advisory only — not legal advice. Consult a Nigerian-qualified lawyer for binding interpretation.
          </div>

          <Button size="sm" variant="ghost" onClick={analyze} disabled={loading}>
            <Shield className="mr-2 h-3.5 w-3.5" /> Re-analyze
          </Button>
        </div>
      )}
    </div>
  );
}
