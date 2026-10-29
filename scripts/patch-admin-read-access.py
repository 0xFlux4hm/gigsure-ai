#!/usr/bin/env python3
"""
Patch project-scoped GET handlers to grant platform admins read access.

Strategy:
- For each route file under src/app/api/projects/[id]/**,
- Find the GET handler (export const GET = ...),
- Find the membership check inside it,
- Replace the check with one that allows platform admins.

POST/PATCH/DELETE handlers are NOT touched — admins should use the
dedicated /api/admin/* endpoints for write operations.

Pattern matched:
  if (!membership || membership.revokedAt) throw new AuthzError("Not a member", 403);

Replacement:
  // HACKATHON FIX (Oct 29, 2026): admins get read access for oversight
  const _isAdmin = await isPlatformAdmin(userId);
  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);
"""
import re
import sys
from pathlib import Path

ROOT = Path("/home/z/my-project/src/app/api/projects")

# Regex to find the GET handler. We need to capture the start of the handler
# (which gives us the userId variable) and the membership check.
# Pattern: "export const GET = apiRoute(async (req, { params }) => {" or similar,
#   followed by some lines, followed by the membership check.

IMPORT_TO_ADD = 'import { isPlatformAdmin } from "@/lib/auth/admin-access";'

# The original check pattern (with variations)
CHECK_PATTERN = re.compile(
    r'if \(!membership \|\| membership\.revokedAt\) throw new AuthzError\("Not a member", 403\);'
)

# Replacement template
CHECK_REPLACEMENT = (
    '// HACKATHON FIX (Oct 29, 2026): platform admins get read access for oversight\n'
    '  const _isAdmin = await isPlatformAdmin(userId);\n'
    '  if ((!membership || membership.revokedAt) && !_isAdmin) throw new AuthzError("Not a member", 403);'
)

# Identify GET handlers by walking the file
GET_HANDLER_RE = re.compile(
    r'export const GET\s*=\s*apiRoute\(async\s*\(',
    re.MULTILINE,
)


def patch_file(path: Path) -> tuple[bool, str]:
    """Returns (was_patched, description)."""
    text = path.read_text()
    original = text

    # Find GET handler position
    get_match = GET_HANDLER_RE.search(text)
    if not get_match:
        return False, "no GET handler"

    # Find the end of the file or the next `export const` after GET
    next_export_match = re.search(
        r'\nexport const (?:POST|PATCH|DELETE|PUT)\s*=',
        text[get_match.end():],
    )
    if next_export_match:
        get_section_end = get_match.end() + next_export_match.start()
    else:
        get_section_end = len(text)

    get_section = text[get_match.start():get_section_end]

    # If the GET section doesn't have the membership check, skip
    if not CHECK_PATTERN.search(get_section):
        return False, "GET handler has no membership check"

    # Replace the check inside the GET section
    new_get_section = CHECK_PATTERN.sub(CHECK_REPLACEMENT, get_section, count=1)
    text = text[:get_match.start()] + new_get_section + text[get_section_end:]

    # Add the import if not already present
    if IMPORT_TO_ADD not in text:
        # Find the last import line and add after it
        imports = list(re.finditer(r'^import .*?;\s*$', text, re.MULTILINE))
        if imports:
            last_import = imports[-1]
            text = text[:last_import.end()] + '\n' + IMPORT_TO_ADD + text[last_import.end():]
        else:
            # No imports — add at top
            text = IMPORT_TO_ADD + '\n' + text

    if text == original:
        return False, "no change made"

    path.write_text(text)
    return True, "patched"


def main():
    files = list(ROOT.rglob("route.ts"))
    files.sort()
    print(f"Scanning {len(files)} route files...")
    print()

    patched_count = 0
    skipped_count = 0
    for f in files:
        rel = f.relative_to(ROOT.parent.parent.parent)
        was_patched, why = patch_file(f)
        marker = "✓ PATCHED" if was_patched else "  skip   "
        print(f"  {marker}  {rel}  ({why})")
        if was_patched:
            patched_count += 1
        else:
            skipped_count += 1

    print()
    print(f"Patched: {patched_count}")
    print(f"Skipped: {skipped_count}")


if __name__ == "__main__":
    main()
