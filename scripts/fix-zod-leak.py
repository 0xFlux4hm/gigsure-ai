"""
Fix Zod issues leak across 15 API routes.

Replaces `fail("...", 422, { issues: parsed.error.issues })` with
`fail("...", 422)` (and logs the issues server-side).

Usage: python3 scripts/fix-zod-leak.py
"""
import re
import os

ROOT = "/home/z/my-project/src/app/api"

# Pattern: fail("...", 422, { issues: parsed.error.issues })
# Or:     fail("...", 422, { issues: parsed.error.issues })
PATTERN = re.compile(
    r"fail\(([\"'][^\"']+[\"']),\s*422,\s*\{\s*issues:\s*(\w+\.error\.issues)\s*\}\)",
)

count = 0
for dirpath, dirs, files in os.walk(ROOT):
    for f in files:
        if not f.endswith(".ts"):
            continue
        path = os.path.join(dirpath, f)
        with open(path) as fh:
            content = fh.read()
        new_content, n = PATTERN.subn(r'fail(\1, 422)', content)
        if n > 0:
            # Add logSecurityEvent import if not present
            if "logSecurityEvent" not in new_content:
                # Find the last `import` line and append
                import_match = re.search(r"^(import [^\n]+;\s*\n)+", new_content, re.MULTILINE)
                if import_match:
                    insert_pos = import_match.end()
                    new_content = (
                        new_content[:insert_pos]
                        + 'import { logSecurityEvent } from "@/lib/auth/audit";\n'
                        + new_content[insert_pos:]
                    )
            # Replace the fail call to log issues + return generic message
            # We need to wrap in a check + log call
            # Pattern: `if (!parsed.success) return fail("...", 422);`
            # We want:  `if (!parsed.success) { logSecurityEvent("warn", "api.validation_failed", { issues: parsed.error.issues.map(...) }); return fail("...", 422); }`
            # But that's complex — simpler: log inline using a helper
            new_content = new_content.replace(
                "if (!parsed.success) return fail(",
                "if (!parsed.success) { logSecurityEvent(\"warn\", \"api.validation_failed\", { issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }); return fail(",
            )
            # The replacement above adds `{` but not the matching `}` — need to fix
            # The original was: `if (!parsed.success) return fail("X", 422);`
            # After replace: `if (!parsed.success) { ... return fail("X", 422);`
            # We need to add `}` after the fail call
            # Match: `return fail("...", 422);` and replace with `return fail("...", 422); }`
            new_content = re.sub(
                r"(if \(!parsed\.success\) \{ logSecurityEvent[^;]+; return fail\([^)]+\);)(\s|$)",
                r"\1 }\2",
                new_content,
            )
            with open(path, "w") as fh:
                fh.write(new_content)
            count += n
            print(f"  Fixed {n} in {path}")

print(f"\nTotal fixes: {count}")
