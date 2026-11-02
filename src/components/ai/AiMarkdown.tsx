"use client";

/**
 * Professional Markdown renderer for AI responses.
 *
 * Renders AI-generated text as a polished research report with:
 *   - GitHub-flavored Markdown (tables, strikethrough, task lists)
 *   - Premium typography (proper headings, lists, code blocks)
 *   - Automatic severity badge detection (HIGH/MEDIUM/LOW → colored pills)
 *   - Table styling with borders + header row
 *   - Code block + inline code styling
 *   - Blockquote styling for warnings/notes
 *   - External links open in new tab
 *   - Strips raw HTML tags like <br> (converts to proper paragraphs)
 *   - Report-style header with "AI Research Report" branding
 *
 * SAFETY: react-markdown does NOT render raw HTML by default — all HTML
 * tags in the input are escaped and shown as text. We pre-process to
 * convert common ones (<br>, <strong>, <em>) to Markdown equivalents.
 * No `dangerouslySetInnerHTML` is used anywhere.
 */
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

interface AiMarkdownProps {
  children: string;
  className?: string;
  /** Optional title shown in the report header. Defaults to "AI Analysis Report". */
  reportTitle?: string;
  /** Show the report header (icon + title + divider). Default: true */
  showReportHeader?: boolean;
}

/**
 * Severity styling for HIGH/MEDIUM/LOW badges.
 * Used when rendering standalone severity tokens in table cells.
 */
const SEVERITY_CLASS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300 dark:border-red-800",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
};

/**
 * Check if a string is exactly a severity token (HIGH/MEDIUM/LOW).
 * Used to render severity badges inside table cells.
 */
function isSeverityToken(s: string): s is "HIGH" | "MEDIUM" | "LOW" {
  return s === "HIGH" || s === "MEDIUM" || s === "LOW";
}

/**
 * Walk a ReactNode tree and replace standalone severity strings with badges.
 * This handles severity tokens that appear as standalone text in table cells,
 * paragraphs, or list items.
 */
function withSeverityBadges(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    const trimmed = node.trim();
    if (isSeverityToken(trimmed)) {
      return (
        <Badge
          variant="outline"
          className={cn("text-[10px] font-semibold px-1.5 py-0", SEVERITY_CLASS[trimmed])}
        >
          {trimmed}
        </Badge>
      );
    }
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <Fragment key={i}>{withSeverityBadges(child)}</Fragment>
    ));
  }
  return node;
}

// Wrapper component to render children with severity badges
function SeverityAware({ children }: { children?: ReactNode }) {
  return <>{withSeverityBadges(children)}</>;
}

export function AiMarkdown({
  children,
  className,
  reportTitle = "AI Analysis Report",
  showReportHeader = true,
}: AiMarkdownProps) {
  // Pre-process: convert raw HTML to Markdown equivalents
  // (react-markdown escapes raw HTML by default, so <br> would show as text)
  const cleaned = children
    .replace(/<br\s*\/?>/gi, "\n\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Component overrides for react-markdown
  // NOTE: We do NOT override `text` — that breaks table rendering in v10+.
  // Instead, we override `td` and `th` to detect severity tokens and render
  // them as badges. This is the recommended pattern.
  const components: Components = {
    // Open external links in new tab with safe rel attributes
    a: ({ href, children, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    // Wrap tables in scrollable container for mobile responsiveness
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto -mx-1 my-3">
        <table {...props}>{children}</table>
      </div>
    ),
    // Table cells: detect standalone severity tokens and render as badges
    td: ({ children, ...props }) => (
      <td {...props}>
        <SeverityAware>{children}</SeverityAware>
      </td>
    ),
    // Table headers: same treatment
    th: ({ children, ...props }) => (
      <th {...props}>
        <SeverityAware>{children}</SeverityAware>
      </th>
    ),
    // Paragraphs: also detect severity tokens (e.g. "**Severity:** HIGH")
    p: ({ children, ...props }) => (
      <p {...props}>
        <SeverityAware>{children}</SeverityAware>
      </p>
    ),
    // List items: also detect severity tokens
    li: ({ children, ...props }) => (
      <li {...props}>
        <SeverityAware>{children}</SeverityAware>
      </li>
    ),
  };

  return (
    <div className="space-y-3">
      {showReportHeader && (
        <div className="flex items-center gap-2 pb-2 border-b border-border/60">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              {reportTitle}
              <Sparkles className="h-3 w-3 text-primary" />
            </div>
            <div className="text-[10px] text-muted-foreground">Generated by GigSure AI Analyst</div>
          </div>
        </div>
      )}

      <div
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          // Headings — premium hierarchy with colored left bar
          "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
          "prose-h1:text-lg prose-h1:mt-3 prose-h1:mb-2 prose-h1:border-b prose-h1:pb-1 prose-h1:border-border",
          "prose-h2:text-base prose-h2:mt-3 prose-h2:mb-1.5 prose-h2:text-foreground prose-h2:flex prose-h2:items-center prose-h2:gap-2",
          "prose-h2:before:content-[''] prose-h2:before:inline-block prose-h2:before:w-1 prose-h2:before:h-4 prose-h2:before:bg-primary prose-h2:before:rounded-full",
          "prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1 prose-h3:font-semibold prose-h3:text-foreground",
          "prose-h4:text-sm prose-h4:mt-2 prose-h4:mb-1 prose-h4:font-medium prose-h4:text-muted-foreground",
          // Paragraphs + lists
          "prose-p:my-1.5 prose-p:leading-relaxed prose-P:text-foreground/90",
          "prose-ul:my-1.5 prose-ul:list-disc prose-ul:pl-5",
          "prose-ol:my-1.5 prose-ol:list-decimal prose-ol:pl-5",
          "prose-li:my-0.5 prose-li:text-foreground/90",
          // Tables (GFM) — premium styled like data tables
          "prose-table:border-collapse prose-table:w-full prose-table:text-xs prose-table:overflow-hidden prose-table:rounded-md prose-table:border prose-table:border-border",
          "prose-thead:bg-muted/60",
          "prose-th:border prose-th:border-border prose-th:px-2.5 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold prose-th:text-foreground prose-th:text-[11px] prose-th:uppercase prose-th:tracking-wide",
          "prose-td:border prose-td:border-border prose-td:px-2.5 prose-td:py-1.5 prose-td:text-foreground/90",
          "prose-tr:hover:bg-muted/30 prose-tr:transition-colors",
          // Code — primary tint
          "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-code:font-mono prose-code:text-primary prose-code:before:content-none prose-code:after:content-none",
          "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:text-xs",
          // Blockquotes — info callout style
          "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-primary/5 prose-blockquote:py-1.5 prose-blockquote:pl-3 prose-blockquote:my-2 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:text-foreground/80",
          // Links
          "prose-a:text-primary prose-a:font-medium prose-a:underline prose-a:underline-offset-2",
          // Strong + em
          "prose-strong:font-semibold prose-strong:text-foreground",
          "prose-em:text-muted-foreground",
          // HR
          "prose-hr:border-border prose-hr:my-4",
          className,
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {cleaned}
        </ReactMarkdown>
      </div>
    </div>
  );
}
