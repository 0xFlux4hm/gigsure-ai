/**
 * CSP violation report endpoint.
 *
 * Browsers POST violation reports here when the Content-Security-Policy
 * blocks a resource. Reports are logged via logSecurityEvent so they
 * appear in structured logs for monitoring.
 *
 * The CSP header includes `report-to gigsure-csp` + a Report-To header
 * that points the browser to this endpoint.
 *
 * No authentication required — CSP reports are sent by the browser
 * automatically and don't contain sensitive data (just the violated
 * directive + the blocked URI).
 *
 * Body size is capped at 4 KiB (browsers send small JSON reports).
 */
import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/auth/audit";

const MAX_CSP_REPORT_BYTES = 4 * 1024; // 4 KiB

export async function POST(req: Request) {
  // Body-size limit
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_CSP_REPORT_BYTES) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_CSP_REPORT_BYTES) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }

  try {
    // CSP reports can be a single object or an array with one object.
    // The Report-To API sends: { type: "csp-violation", body: { ... } }
    // The legacy report-uri sends: { "csp-report": { ... } }
    const data = JSON.parse(raw);

    const report = data?.body ?? data?.["csp-report"] ?? data;
    const violatedDirective = report?.["violated-director"] ?? report?.["violatedDirective"] ?? "unknown";
    const blockedUri = report?.["blocked-uri"] ?? report?.["blockedURI"] ?? "unknown";
    const documentUri = report?.["document-uri"] ?? report?.["documentURI"] ?? "unknown";
    const lineNumber = report?.["line-number"] ?? report?.["lineNumber"] ?? 0;

    logSecurityEvent("warn", "csp.violation", {
      directive: violatedDirective,
      blockedUri: String(blockedUri).slice(0, 200),
      documentUri: String(documentUri).slice(0, 200),
      lineNumber,
    });
  } catch {
    // Malformed report — log raw (truncated)
    logSecurityEvent("warn", "csp.malformed_report", {
      raw: raw.slice(0, 200),
    });
  }

  // Always return 204 — browsers don't need a response body
  return new NextResponse(null, { status: 204 });
}
