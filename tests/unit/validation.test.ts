/**
 * Validation utility tests.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  validateEmail,
  sanitizeDisplayName,
  validateCurrency,
  amountToMinor,
  minorToAmount,
  safeBasename,
  isSafeRedirect,
  isAllowedUploadMime,
  MAX_UPLOAD_BYTES,
} from "@/lib/security/validation";

describe("email validation", () => {
  it("normalizes email to lowercase + trimmed", () => {
    expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
  });

  it("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("a.b+c@example.co.uk")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("user@example")).toBe(false);
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("a".repeat(255) + "@x.com")).toBe(false);
  });
});

describe("display name sanitization", () => {
  it("trims whitespace", () => {
    expect(sanitizeDisplayName("  John Doe  ")).toBe("John Doe");
  });

  it("strips control characters", () => {
    expect(sanitizeDisplayName("John\u0000Doe")).toBe("JohnDoe");
    expect(sanitizeDisplayName("John\nDoe")).toBe("JohnDoe");
  });

  it("strips angle brackets (XSS prevention)", () => {
    expect(sanitizeDisplayName("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
  });

  it("rejects empty", () => {
    expect(sanitizeDisplayName("")).toBe("");
    expect(sanitizeDisplayName("   ")).toBe("");
  });

  it("rejects too-long names", () => {
    expect(sanitizeDisplayName("a".repeat(81))).toBe("");
  });
});

describe("currency validation", () => {
  it("accepts supported currencies", () => {
    expect(validateCurrency("NGN")).toBe(true);
    expect(validateCurrency("USD")).toBe(true);
    expect(validateCurrency("GHS")).toBe(true);
    expect(validateCurrency("gbp")).toBe(true);
  });

  it("rejects unsupported currencies", () => {
    expect(validateCurrency("XYZ")).toBe(false);
    expect(validateCurrency("")).toBe(false);
    expect(validateCurrency("BTC")).toBe(false);
  });
});

describe("amount conversion", () => {
  it("converts major to minor units", () => {
    expect(amountToMinor(500, "NGN")).toBe(50000);
    expect(amountToMinor(1, "NGN")).toBe(100);
    expect(amountToMinor(0.5, "NGN")).toBe(50);
  });

  it("converts minor back to major", () => {
    expect(minorToAmount(50000, "NGN")).toBe(500);
    expect(minorToAmount(100, "NGN")).toBe(1);
  });

  it("rejects negative or non-finite amounts", () => {
    expect(() => amountToMinor(-1, "NGN")).toThrow();
    expect(() => amountToMinor(NaN, "NGN")).toThrow();
    expect(() => amountToMinor(Infinity, "NGN")).toThrow();
  });
});

describe("path traversal protection", () => {
  it("strips dangerous characters from filenames", () => {
    // safeBasename strips path separators (/ \ : * ? " < > |) and collapses leading dots
    // The exact output depends on the implementation, but it should:
    //   - Not contain any path separators after sanitization
    //   - Not start with a dot (no hidden-file creation)
    //   - Be a safe single-segment basename
    const result1 = safeBasename("../../etc/passwd");
    expect(result1).not.toMatch(/[\\/]/);
    expect(result1.length).toBeGreaterThan(0);

    const result2 = safeBasename("..\\..\\windows\\system32");
    expect(result2).not.toMatch(/[\\/]/);
    expect(result2.length).toBeGreaterThan(0);

    const result3 = safeBasename("file<script>.png");
    expect(result3).not.toContain("<");
    expect(result3).not.toContain(">");
    expect(result3.length).toBeGreaterThan(0);
  });

  it("falls back to default for empty input", () => {
    expect(safeBasename("")).toBe("file");
    expect(safeBasename("   ")).toBe("file");
  });

  it("limits length", () => {
    expect(safeBasename("a".repeat(300)).length).toBe(255);
  });
});

describe("redirect safety", () => {
  it("accepts relative paths", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/?view=dashboard")).toBe(true);
    expect(isSafeRedirect("?foo=bar")).toBe(true);
  });

  it("rejects absolute URLs", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://localhost:3000")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
  });

  it("rejects backslashes", () => {
    expect(isSafeRedirect("\\\\evil.com")).toBe(false);
  });

  it("rejects newlines (CRLF injection)", () => {
    expect(isSafeRedirect("/\nevil.com")).toBe(false);
    expect(isSafeRedirect("/\r\nX-Injected: yes")).toBe(false);
  });

  it("rejects empty / null", () => {
    expect(isSafeRedirect("")).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
  });
});

describe("upload MIME allowlist", () => {
  it("accepts safe image types", () => {
    expect(isAllowedUploadMime("image/png")).toBe(true);
    expect(isAllowedUploadMime("image/jpeg")).toBe(true);
    expect(isAllowedUploadMime("image/webp")).toBe(true);
  });

  it("accepts safe document types", () => {
    expect(isAllowedUploadMime("application/pdf")).toBe(true);
    expect(isAllowedUploadMime("text/plain")).toBe(true);
    expect(isAllowedUploadMime("text/markdown")).toBe(true);
  });

  it("rejects executable / script types", () => {
    expect(isAllowedUploadMime("application/x-executable")).toBe(false);
    expect(isAllowedUploadMime("application/x-msdownload")).toBe(false);
    expect(isAllowedUploadMime("text/html")).toBe(false);
    expect(isAllowedUploadMime("image/svg+xml")).toBe(false);
    expect(isAllowedUploadMime("application/javascript")).toBe(false);
  });

  it("enforces size limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
  });
});
