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
 * IMPLEMENTATION NOTE:
 *   We use explicit Tailwind utility classes on each rendered element
 *   (via the `components` override map) instead of relying on the
 *   `prose` class from @tailwindcss/typography. This is more reliable
 *   across Tailwind v4 setups where the typography plugin's `prose`
 *   classes may not be generated correctly.
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
 */
const SEVERITY_CLASS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300 dark:border-red-800",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
};

function isSeverityToken(s: string): s is "HIGH" | "MEDIUM" | "LOW" {
  return s === "HIGH" || s === "MEDIUM" || s === "LOW";
}

/**
 * Walk a ReactNode tree and replace standalone severity strings with badges.
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
  const cleaned = children
    .replace(/<br\s*\/?>/gi, "\n\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Component overrides — explicit Tailwind utility classes on each element
  // (more reliable than depending on @tailwindcss/typography `prose` classes)
  const components: Components = {
    h1: ({ children, ...props }) => (
      <h1 className="text-lg font-semibold tracking-tight mt-4 mb-2 pb-1 border-b border-border text-foreground" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="flex items-center gap-2 text-base font-semibold mt-3 mb-1.5 text-foreground" {...props}>
        <span className="inline-block w-1 h-4 bg-primary rounded-full" />
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground" {...props}>
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 className="text-sm font-medium mt-2 mb-1 text-muted-foreground" {...props}>
        {children}
      </h4>
    ),
    p: ({ children, ...props }) => (
      <p className="my-1.5 leading-relaxed text-foreground/90 text-sm" {...props}>
        <SeverityAware>{children}</SeverityAware>
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="my-1.5 list-disc pl-5 space-y-0.5" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-1.5 list-decimal pl-5 space-y-0.5" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="text-foreground/90 text-sm" {...props}>
        <SeverityAware>{children}</SeverityAware>
      </li>
    ),
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-foreground" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em className="text-muted-foreground" {...props}>
        {children}
      </em>
    ),
    a: ({ href, children, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2" {...props}>
        {children}
      </a>
    ),
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto -mx-1 my-3 rounded-md border border-border">
        <table className="w-full border-collapse text-xs" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-muted/60" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }) => (
      <th className="border border-border px-2.5 py-1.5 text-left font-semibold text-foreground text-[11px] uppercase tracking-wide" {...props}>
        <SeverityAware>{children}</SeverityAware>
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-border px-2.5 py-1.5 text-foreground/90" {...props}>
        <SeverityAware>{children}</SeverityAware>
      </td>
    ),
    tr: ({ children, ...props }) => (
      <tr className="transition-colors hover:bg-muted/30" {...props}>
        {children}
      </tr>
    ),
    code: ({ children, className: codeClass, ...props }) => {
      // Inline code vs block code
      const isBlock = codeClass?.includes("language-");
      if (isBlock) {
        return (
          <code className="block bg-muted border border-border rounded-md p-3 text-xs font-mono overflow-x-auto" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-primary" {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre className="bg-muted border border-border rounded-md p-3 text-xs overflow-x-auto my-2" {...props}>
        {children}
      </pre>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote className="border-l-2 border-primary/40 bg-primary/5 py-1.5 pl-3 my-2 rounded-r not-italic text-foreground/80 text-sm" {...props}>
        {children}
      </blockquote>
    ),
    hr: ({ ...props }) => (
      <hr className="border-border my-4" {...props} />
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

      <div className={cn("text-sm", className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {cleaned}
        </ReactMarkdown>
      </div>
    </div>
  );
}
