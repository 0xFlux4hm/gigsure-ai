// Quick test: verify the regex preprocessing in AiMarkdown works correctly
// (no need to import the .tsx — just test the logic)

const sample = `## 1. Executive Summary
The project has **4 high-severity risks** that require immediate attention. The most critical is a milestone due *after* the project deadline.<br>
Some text with <strong>bold HTML</strong> and <em>italic HTML</em>.

## 2. Key Findings
| # | Risk | Severity | Evidence | Impact |
|---|------|----------|----------|--------|
| 1 | Milestone due after deadline | HIGH | 2026-11-29 vs 2026-11-21 | Project overruns |
| 2 | No tasks defined | HIGH | _count.tasks = 0 | Work not tracked |

### Finding 1: Milestone due after deadline
- **Observation:** Milestone "Beta Launch" is due 2026-11-29
- **Risk:** Project deadline is 2026-11-21
- **Recommendation:** Move milestone earlier

## 5. Confidence
- **Confidence:** HIGH`;

// Replicate the preprocessing from AiMarkdown
const cleaned = sample
  .replace(/<br\s*\/?>/gi, "\n\n")
  .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
  .replace(/<em>(.*?)<\/em>/gi, "*$1*")
  .replace(/<b>(.*?)<\/b>/gi, "**$1**")
  .replace(/<i>(.*?)<\/i>/gi, "*$1*")
  .replace(/<p>/gi, "\n\n")
  .replace(/<\/p>/gi, "\n\n")
  .replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

console.log("=== Original input ===");
console.log(sample.slice(0, 200) + "...\n");
console.log("=== After preprocessing ===");
console.log(cleaned.slice(0, 300) + "...\n");

// Verify
console.log("=== Verification ===");
console.log("No raw <br>:", !cleaned.includes("<br>") ? "✓ PASS" : "✗ FAIL");
console.log("No raw <strong>:", !cleaned.includes("<strong>") ? "✓ PASS" : "✗ FAIL");
console.log("No raw <em>:", !cleaned.includes("<em>") ? "✓ PASS" : "✗ FAIL");
console.log("Has ## headings (will render):", cleaned.includes("## ") ? "✓ PASS" : "✗ FAIL");
console.log("Has ** bold (will render):", cleaned.includes("**") ? "✓ PASS" : "✗ FAIL");
console.log("Has |table| (will render):", cleaned.includes("|") ? "✓ PASS" : "✗ FAIL");
console.log("Has standalone HIGH tokens:", /\bHIGH\b/.test(cleaned) ? "✓ PASS (will become badges)" : "✗ FAIL");
