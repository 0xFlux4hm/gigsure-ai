"use client";

/**
 * Professional Markdown renderer for AI responses.
 *
 * Renders AI-generated text (which often contains **bold**, tables, lists,
 * code blocks, headings) as properly-styled HTML instead of raw markdown
 * syntax. Matches GigSure's premium design system.
 *
 * Features:
 *   - GitHub-flavored Markdown (tables, strikethrough, task lists)
 *   - Premium typography (proper headings, lists, code blocks)
 *   - Table styling with borders + header row
 *   - Code block + inline code styling
 *   - Blockquote styling
 *   - Link styling (external links open in new tab)
 *   - Strips raw HTML tags like <br> (converts to proper paragraphs)
 *
 * Usage:
 *   <AiMarkdown>{response}</AiMarkdown>
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface AiMarkdownProps {
  children: string;
  className?: string;
}

export function AiMarkdown({ children, className }: AiMarkdownProps) {
  // Pre-process: convert raw <br> tags to newlines so react-markdown handles them
  const cleaned = children
    .replace(/<br\s*\/?>/gi, "\n")
    // Convert raw <strong>...</strong> to **...** for consistency
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*");

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        // Headings
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h1:text-xl prose-h1:mt-4 prose-h1:mb-2",
        "prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2 prose-h2:border-b prose-h2:pb-1 prose-h2:border-border",
        "prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1",
        "prose-h4:text-sm prose-h4:mt-2 prose-h4:mb-1",
        // Paragraphs + lists
        "prose-p:my-2 prose-p:leading-relaxed",
        "prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-li:my-0.5",
        "prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5",
        // Tables (GFM)
        "prose-table:border-collapse prose-table:w-full prose-table:my-3 prose-table:text-sm",
        "prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold",
        "prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1.5",
        // Code
        "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md",
        // Blockquotes
        "prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:bg-muted/30 prose-blockquote:py-2 prose-blockquote:pl-4 prose-blockquote:my-3 prose-blockquote:not-italic",
        // Links
        "prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
        // Strong + em
        "prose-strong:font-semibold prose-strong:text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open external links in new tab
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          // Ensure tables have proper wrapper for overflow on mobile
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
