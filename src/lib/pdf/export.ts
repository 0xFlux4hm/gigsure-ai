/**
 * Client-side PDF generation utility.
 *
 * Uses jsPDF + jspdf-autotable to generate professional-looking PDF
 * documents entirely in the browser. No server-side rendering needed —
 * works perfectly on Vercel serverless.
 *
 * Supported document types:
 *   - Privacy data export (user's personal data snapshot)
 *   - Audit log export (user's audit trail)
 *   - Admin exports (users, payments, payouts, disputes, audit events)
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Brand colors — deep emerald green (Nigerian trust color)
const BRAND_GREEN: [number, number, number] = [16, 122, 87];
const TEXT_DARK: [number, number, number] = [30, 30, 30];
const TEXT_MUTED: [number, number, number] = [120, 120, 120];
const BORDER_LIGHT: [number, number, number] = [220, 220, 220];

type PDFContext = {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  y: number;
};

function createDoc(): PDFContext {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  return { doc, pageWidth, pageHeight, margin, y: margin };
}

function addHeader(ctx: PDFContext, title: string, subtitle?: string): void {
  const { doc, pageWidth, margin } = ctx;

  // Brand bar
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, pageWidth, 72, "F");

  // Logo text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("GigSure AI", margin, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Work with confidence. Get paid with trust.", margin, 54);

  // Document title
  ctx.y = 104;
  doc.setTextColor(...TEXT_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, margin, ctx.y);

  if (subtitle) {
    ctx.y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(subtitle, margin, ctx.y);
  }

  ctx.y += 24;
  doc.setDrawColor(...BORDER_LIGHT);
  doc.setLineWidth(0.5);
  doc.line(margin, ctx.y, pageWidth - margin, ctx.y);
  ctx.y += 24;
}

function addFooter(ctx: PDFContext): void {
  const { doc, pageWidth, pageHeight, margin } = ctx;
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(
      `GigSure AI · Generated ${new Date().toLocaleString("en-NG")}`,
      margin,
      pageHeight - 24,
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin - 60,
      pageHeight - 24,
    );
  }
}

function addSectionTitle(ctx: PDFContext, title: string): void {
  ctx.y += 8;
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(12);
  ctx.doc.setTextColor(...BRAND_GREEN);
  ctx.doc.text(title, ctx.margin, ctx.y);
  ctx.y += 16;
}

function addKeyValue(ctx: PDFContext, pairs: Array<[string, string]>): void {
  const { doc, margin, pageWidth } = ctx;
  const colWidth = (pageWidth - margin * 2) / 2;

  autoTable(doc, {
    startY: ctx.y,
    head: [["Field", "Value"]],
    body: pairs.map(([k, v]) => [k, v]),
    theme: "striped",
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold" as const,
      fontSize: 10,
    },
    bodyStyles: { fontSize: 9, textColor: TEXT_DARK },
    alternateRowStyles: { fillColor: [248, 250, 248] },
    columnStyles: {
      0: { cellWidth: colWidth * 0.35, fontStyle: "bold" as const },
      1: { cellWidth: colWidth * 0.65 },
    },
    margin: { left: margin, right: margin },
  });

  // @ts-expect-error — autoTable adds lastAutoTable to doc at runtime
  ctx.y = doc.lastAutoTable.finalY + 20;
}

function addTable(
  ctx: PDFContext,
  head: string[][],
  body: string[][],
  columnStyles?: Record<number, { cellWidth?: number }>,
): void {
  const { doc, margin } = ctx;
  autoTable(doc, {
    startY: ctx.y,
    head,
    body,
    theme: "striped",
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold" as const,
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8, textColor: TEXT_DARK },
    alternateRowStyles: { fillColor: [248, 250, 248] },
    columnStyles,
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error — autoTable adds lastAutoTable to doc at runtime
  ctx.y = doc.lastAutoTable.finalY + 20;
}

function addParagraph(ctx: PDFContext, text: string): void {
  const { doc, margin, pageWidth } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);
  const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
  for (const line of lines) {
    if (ctx.y + 14 > ctx.pageHeight - 60) {
      doc.addPage();
      ctx.y = ctx.margin;
    }
    doc.text(line, margin, ctx.y);
    ctx.y += 14;
  }
  ctx.y += 8;
}

function triggerDownload(doc: jsPDF, filename: string): void {
  doc.save(filename);
}

// ---------------------------------------------------------------------------
// Public API — one function per document type
// ---------------------------------------------------------------------------

export function exportPrivacyDataPDF(data: {
  user: Record<string, unknown>;
  profile?: Record<string, unknown>;
  identities?: Array<Record<string, unknown>>;
  projectsOwned?: Array<Record<string, unknown>>;
  memberships?: Array<Record<string, unknown>>;
  tasksAssigned?: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
  auditEvents?: Array<Record<string, unknown>>;
  privacyRequests?: Array<Record<string, unknown>>;
}): void {
  const ctx = createDoc();
  const date = new Date().toLocaleDateString("en-NG");

  addHeader(
    ctx,
    "Personal Data Export",
    `Data subject: ${(data.user as { email?: string }).email ?? "Unknown"} · Generated ${date}`,
  );

  addParagraph(
    ctx,
    "This document contains all personal data GigSure AI has stored about your account, " +
      "in compliance with the Nigeria Data Protection Regulation (NDPR). " +
      "If you have questions about this data, contact privacy@gigsure.ai.",
  );

  // Account information
  addSectionTitle(ctx, "Account Information");
  const userPairs: Array<[string, string]> = Object.entries(data.user)
    .filter(([k]) => !["passwordHash"].includes(k))
    .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]);
  addKeyValue(ctx, userPairs);

  // Linked identities
  if (data.identities && data.identities.length > 0) {
    addSectionTitle(ctx, "Linked Identities");
    addTable(
      ctx,
      [["Provider", "Subject", "Last Authenticated"]],
      data.identities.map((id) => [
        String(id.provider ?? ""),
        String(id.providerSubject ?? ""),
        id.lastAuthenticatedAt ? new Date(id.lastAuthenticatedAt as string).toLocaleString("en-NG") : "—",
      ]),
    );
  }

  // Projects owned
  if (data.projectsOwned && data.projectsOwned.length > 0) {
    addSectionTitle(ctx, "Projects Owned");
    addTable(
      ctx,
      [["Title", "Status", "Created"]],
      data.projectsOwned.map((p) => [
        String(p.title ?? ""),
        String(p.status ?? ""),
        p.createdAt ? new Date(p.createdAt as string).toLocaleDateString("en-NG") : "—",
      ]),
    );
  }

  // Audit events
  if (data.auditEvents && data.auditEvents.length > 0) {
    addSectionTitle(ctx, "Audit Trail");
    addTable(
      ctx,
      [["Date", "Action", "Target"]],
      data.auditEvents.slice(0, 100).map((e) => [
        e.createdAt ? new Date(e.createdAt as string).toLocaleString("en-NG") : "—",
        String(e.action ?? ""),
        String(e.targetType ?? ""),
      ]),
    );
  }

  addFooter(ctx);
  triggerDownload(ctx.doc, `gigsure-privacy-export-${date.replace(/\//g, "-")}.pdf`);
}

export function exportAuditLogPDF(events: Array<Record<string, unknown>>): void {
  const ctx = createDoc();
  const date = new Date().toLocaleDateString("en-NG");

  addHeader(ctx, "Audit Log Export", `${events.length} events · Generated ${date}`);

  addParagraph(
    ctx,
    "This document contains your account's audit trail — every significant action taken on or by your account. " +
      "Events are listed in reverse chronological order.",
  );

  addTable(
    ctx,
    [["Date", "Action", "Target Type", "Target ID"]],
    events.map((e) => [
      e.createdAt ? new Date(e.createdAt as string).toLocaleString("en-NG") : "—",
      String(e.action ?? ""),
      String(e.targetType ?? "—"),
      String(e.targetId ?? "—").slice(0, 12),
    ]),
  );

  addFooter(ctx);
  triggerDownload(ctx.doc, `gigsure-audit-log-${date.replace(/\//g, "-")}.pdf`);
}

export type AdminExportConfig = {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  columnWidths?: number[];
};

export function exportAdminPDF(config: AdminExportConfig): void {
  const ctx = createDoc();
  const date = new Date().toLocaleDateString("en-NG");

  addHeader(ctx, config.title, config.subtitle ?? `Generated ${date}`);

  if (config.rows.length === 0) {
    addParagraph(ctx, "No records to export.");
  } else {
    const columnStyles: Record<number, { cellWidth?: number }> = {};
    if (config.columnWidths) {
      config.columnWidths.forEach((w, i) => {
        columnStyles[i] = { cellWidth: w };
      });
    }
    addTable(ctx, [config.columns], config.rows, columnStyles);
  }

  addFooter(ctx);
  triggerDownload(ctx.doc, `gigsure-${config.title.toLowerCase().replace(/\s+/g, "-")}-${date.replace(/\//g, "-")}.pdf`);
}

/**
 * Generic PDF export for any tabular data with a title.
 */
export function exportTablePDF(
  title: string,
  columns: string[],
  rows: string[][],
): void {
  exportAdminPDF({ title, columns, rows });
}
