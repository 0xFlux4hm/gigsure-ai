"use client";

/**
 * Professional AI Report Renderer — parses AI markdown output into a
 * structured dashboard-style report with:
 *
 *   1. Header (icon + title + "Generated just now")
 *   2. Summary Stat Cards (Total / High / Medium / Low)
 *   3. Key Findings Table (with colored severity badges)
 *   4. Recommendations section (numbered list with checkmark icons)
 *   5. Advisory footer banner
 *
 * The renderer parses the AI's markdown response to extract:
 *   - Counts from any table (count of HIGH/MEDIUM/LOW rows)
 *   - The table itself (rendered with styled badges)
 *   - Recommendations section content
 *
 * If parsing fails, it falls back to the AiMarkdown renderer so the
 * raw text is still readable.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  Clock, Lightbulb, FileText, Sparkles,
} from "lucide-react";

interface AiReportRendererProps {
  /** The raw AI-generated markdown response */
  response: string;
  /** Title for the report (e.g. "Project Risk Assistant") */
  title?: string;
  /** Show the "Generated just now" timestamp */
  showTimestamp?: boolean;
}

interface ParsedReport {
  tableRows: string[][];
  tableHeaders: string[];
  severityCounts: { HIGH: number; MEDIUM: number; LOW: number; total: number };
  recommendations: string[];
  hasTable: boolean;
}

/**
 * Parse the AI markdown response to extract:
 * - The first markdown table (headers + rows)
 * - Count of HIGH/MEDIUM/LOW severity tokens in the table
 * - The Recommendations section content
 */
function parseReport(markdown: string): ParsedReport {
  const result: ParsedReport = {
    tableRows: [],
    tableHeaders: [],
    severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, total: 0 },
    recommendations: [],
    hasTable: false,
  };

  // Find the first markdown table
  // Format: | header | header |\n|---|---|\n| cell | cell |
  const tableRegex = /\|([^\n]+)\|\s*\n\|[\s\-:|]+\|\s*\n((?:\|[^\n]+\|\s*\n?)+)/;
  const tableMatch = markdown.match(tableRegex);

  if (tableMatch) {
    result.hasTable = true;
    const headerLine = tableMatch[1];
    const rowsBlock = tableMatch[2];

    result.tableHeaders = headerLine
      .split("|")
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    const rowLines = rowsBlock.trim().split("\n");
    result.tableRows = rowLines.map((line) =>
      line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    );

    // Count severity tokens across all cells
    for (const row of result.tableRows) {
      for (const cell of row) {
        if (cell === "HIGH") result.severityCounts.HIGH++;
        else if (cell === "MEDIUM") result.severityCounts.MEDIUM++;
        else if (cell === "LOW") result.severityCounts.LOW++;
      }
    }
    result.severityCounts.total = result.tableRows.length;
  }

  // Find Recommendations section
  // Looks for "## 4. Recommendations" or "## Recommendations" and captures
  // the numbered list that follows
  const recSectionRegex = /(?:##\s*)?(?:\d+\.\s*)?Recommendations?\s*\n+((?:(?:\d+[\.\)]\s+|-\s+|\*\s+)[^\n]+\n?)+)/i;
  const recMatch = markdown.match(recSectionRegex);
  if (recMatch) {
    const recBlock = recMatch[1];
    const recLines = recBlock.match(/(?:\d+[\.\)]\s+|-\s+|\*\s+)([^\n]+)/g);
    if (recLines) {
      result.recommendations = recLines.map((line) =>
        line.replace(/^(?:\d+[\.\)]\s+|-\s+|\*\s+)/, "").trim(),
      );
    }
  }

  return result;
}

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300 dark:border-red-800",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  LOW: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800",
};

function SeverityBadge({ value }: { value: string }) {
  const sev = value.toUpperCase();
  if (sev === "HIGH" || sev === "MEDIUM" || sev === "LOW") {
    return (
      <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0 ${SEVERITY_BADGE_CLASS[sev]}`}>
        {sev}
      </Badge>
    );
  }
  return <span className="text-xs">{value}</span>;
}

function StatCard({
  count,
  label,
  icon: Icon,
  bgClass,
  iconClass,
}: {
  count: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  iconClass: string;
}) {
  return (
    <div className={`rounded-lg p-3 ${bgClass} border`}>
      <div className="flex items-center justify-between">
        <Icon className={`h-5 w-5 ${iconClass}`} />
        <span className="text-2xl font-bold tabular-nums">{count}</span>
      </div>
      <div className="text-[11px] font-medium text-muted-foreground mt-1 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

export function AiReportRenderer({
  response,
  title = "AI Analysis Report",
  showTimestamp = true,
}: AiReportRendererProps) {
  const parsed = useMemo(() => parseReport(response), [response]);

  // If we couldn't parse a table, fall back to the markdown renderer
  if (!parsed.hasTable) {
    return <AiMarkdown reportTitle={title}>{response}</AiMarkdown>;
  }

  return (
    <div className="space-y-4">
      {/* Report header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Risk Assessment Report
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div className="text-xs text-muted-foreground">Based on your project data and requirements</div>
        </div>
        {showTimestamp && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Generated just now
          </div>
        )}
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          count={parsed.severityCounts.total}
          label="Total Risks"
          icon={AlertTriangle}
          bgClass="bg-red-50 dark:bg-red-950/20"
          iconClass="text-red-500"
        />
        <StatCard
          count={parsed.severityCounts.HIGH}
          label="High Priority"
          icon={AlertCircle}
          bgClass="bg-orange-50 dark:bg-orange-950/20"
          iconClass="text-orange-500"
        />
        <StatCard
          count={parsed.severityCounts.MEDIUM}
          label="Medium Priority"
          icon={AlertCircle}
          bgClass="bg-blue-50 dark:bg-blue-950/20"
          iconClass="text-blue-500"
        />
        <StatCard
          count={parsed.severityCounts.LOW}
          label="Low Priority"
          icon={CheckCircle2}
          bgClass="bg-emerald-50 dark:bg-emerald-950/20"
          iconClass="text-emerald-500"
        />
      </div>

      {/* Key findings table */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Key Findings</h3>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/60">
              <tr>
                {parsed.tableHeaders.map((header, i) => (
                  <th
                    key={i}
                    className="border-b border-border px-3 py-2 text-left font-semibold text-foreground text-[11px] uppercase tracking-wide"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.tableRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-border px-3 py-2 text-foreground/90">
                      <SeverityBadge value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations section */}
      {parsed.recommendations.length > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Top Recommendations</h3>
          </div>
          <ul className="space-y-1.5">
            {parsed.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advisory footer banner */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <div className="font-semibold text-amber-900 dark:text-amber-300">Advisory Only</div>
          <div className="text-amber-700 dark:text-amber-400 mt-0.5">
            This AI-generated analysis is informational and does not authorize financial
            transfers, override authorization, or make binding legal decisions. Verify
            before acting.
          </div>
        </div>
      </div>

      {/* Collapsible raw markdown (for debugging / advanced users) */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View raw AI response
        </summary>
        <div className="mt-2 p-3 rounded-md bg-muted/30 border border-border">
          <AiMarkdown showReportHeader={false}>{response}</AiMarkdown>
        </div>
      </details>
    </div>
  );
}
