# Security Policy

## Supported Versions

GigSure AI is currently in active development. Security fixes are applied to
the latest `main` branch only — there are no LTS releases yet.

| Version | Supported          |
|---------|--------------------|
| main    | ✅ Active           |
| < 1.0   | ❌ Pre-release; no SLA |

## Reporting a Vulnerability

We welcome responsible disclosure of security vulnerabilities. If you find one,
please **do not open a public GitHub issue**. Instead:

### Preferred: Private disclosure

1. Email: **security@gigsure.example.com** (replace with your real domain)
2. Subject line: `[SECURITY] <brief description>`
3. Include:
   - Description of the vulnerability
   - Steps to reproduce (proof of concept if possible)
   - Affected versions / commits
   - Suggested fix (optional)
   - Your name/handle for credit (optional)

### Alternative: GitHub Security Advisories

1. Go to https://github.com/0xFlux4hm/gigsure-ai/security/advisories/new
2. Click "Report a vulnerability"
3. Fill in the template

## Response Timeline

| Step                                    | Target SLA |
|-----------------------------------------|------------|
| Acknowledge receipt of report           | 48 hours   |
| Initial assessment + severity rating    | 7 days     |
| Fix or mitigation in `main`              | 30 days (critical), 90 days (high), 180 days (medium/low) |
| Public disclosure (with reporter consent) | After fix is released + 14-day grace period |

## Scope

**In scope:**
- The GigSure AI application code (`src/`, `prisma/`)
- Authentication + session handling
- Authorization + access control
- Payment provider integration (mock provider only — real provider integration is out of scope until released)
- API endpoints
- Database schema

**Out of scope:**
- Vulnerabilities in third-party dependencies (report to upstream maintainers)
- Vulnerabilities requiring physical access to the server
- Self-XSS or social engineering attacks
- DoS attacks via volumetric traffic (we use rate limiting; report only if a novel bypass exists)
- Findings from automated scanners without a working PoC

## Security Measures Already in Place

See `docs/SECURITY_REQUIREMENTS.md` and `docs/THREAT_MODEL.md` for the full picture.

Highlights:
- scrypt password hashing (memory-hard)
- SHA-256 hashed tokens (single-use, expiring)
- HMAC-SHA256 webhook signature verification + replay protection
- Idempotency keys on all funding operations
- Server-enforced role-based access control on every protected endpoint
- Per-resource authorization (no IDOR)
- Rate limiting on login, forgot-password, AI assistant endpoints
- CSP, HSTS, X-Frame-Options headers
- Audit log of every security-relevant action
- Privacy workflows (data export, account deletion)

## Known Limitations

Documented in `docs/IMPLEMENTATION_STATUS.md`. Highlights:
- Login endpoint rate limiting is in-memory (single-process); use Redis for multi-instance
- No malware scanning on file uploads yet
- Real payment provider integration is DISABLED — only the mock provider runs
- No production-grade email delivery configured (verification tokens surfaced in dev API response)
- Audit log is append-only by convention; no hash chain yet
- SQLite is the default database for dev — production must use PostgreSQL

## Bug Bounty

No formal bug bounty program is currently in place. We will credit researchers
in release notes upon request.
