# GigSure AI — Database Design

See `prisma/schema.prisma` for the canonical schema. This document explains design decisions.

## Provider

- **Dev**: SQLite (`file:./db/custom.db`) — zero-config, single-file, sufficient for local development.
- **Production**: PostgreSQL. Change `datasource db.provider` to `"postgresql"` and adjust `DATABASE_URL`.

SQLite limitations to be aware of:
- No native ENUM — we use `String` with server-side validation.
- No native `Decimal` — financial values stored as `Int` (minor units).
- Limited concurrent write throughput — acceptable for dev only.
- No row-level locking — transactions are serialised.

## Financial value storage

All money is stored as **integer minor units** (e.g., NGN kobo: ₦500.00 → 50000). This avoids binary floating-point rounding errors that plague `Float`/`Decimal` columns.

```typescript
// Convert major units (e.g., 500.00 NGN) to minor (50000 kobo)
amountToMinor(500.00, "NGN") === 50000;

// Convert back for display
minorToAmount(50000, "NGN") === 500.00;
```

Currency codes are ISO 4217 strings (`NGN`, `USD`, etc.). Decimal precision varies by currency (JPY uses 0 decimals; most others use 2). See `src/lib/security/validation.ts` → `currencyDecimals()`.

## Identity model (one account, many auth methods)

```
User (1) ──── (N) UserIdentity
                  - provider: "password" | "google" | "github" | ...
                  - providerSubject: OIDC sub (Google) or email (password)
                  - UNIQUE (provider, providerSubject)
```

This is the **unified identity model** required by spec section 7.6. A user can register with email/password and later link a Google identity, or vice versa. The application never auto-merges accounts based on email match — linking requires explicit re-authentication.

## Token storage

All tokens (email verification, password reset, invitation) are 32-byte cryptographic random strings. Only their **SHA-256 hash** is stored:

```typescript
const rawToken = generateToken();      // 32 bytes base64url
const tokenHash = hashToken(rawToken);  // SHA-256 hex
await db.emailVerificationToken.create({
  data: { userId, tokenHash, expiresAt }
});
// rawToken is sent via email / returned in dev mode only
```

This means a database leak does not expose usable tokens. Tokens are single-use (`consumedAt`) and expire (24h for verification, 1h for password reset, 7d default for invitations).

## Versioning: contracts & compensation

Both `ContractVersion` and `CompensationAgreement` use an integer `versionNumber` that increments monotonically per project. When a new version is created, the previous ACCEPTED version is marked `SUPERSEDED` (preserved — never deleted). The project's `currentContractVersionId` pointer is updated atomically when all required parties accept the new version.

```sql
-- What happens on new version:
INSERT INTO ContractVersion (..., status='PROPOSED', versionNumber=N+1);
UPDATE ContractVersion SET status='SUPERSEDED' WHERE status='ACCEPTED' AND id <> new_id;
-- On all-accepted:
UPDATE ContractVersion SET status='ACCEPTED' WHERE id = new_id;
UPDATE Project SET currentContractVersionId = new_id;
```

## Funding state machine

```
FundingRecord.status:
  DRAFT → INITIATED → PROVIDER_CONFIRMED  (success path)
                  ↘ FAILED               (provider rejection)
                  ↘ CANCELLED             (manual)

Milestone.status:
  DRAFT → AWAITING_FUNDING → FUNDED → SUBMITTED → APPROVED → RELEASE_INITIATED → RELEASED
                                ↓
                              DISPUTED  (while dispute open — blocks release)
```

The mock provider simulates async webhook delivery (400ms after `initiateFunding`). The webhook handler verifies HMAC signature + replay (via `providerEventId`) and updates the record transactionally.

## Audit log

`AuditEvent` records every security-relevant action:
- `auth.login_success`, `auth.login_failed`, `auth.google_login`
- `auth.email_verified`, `auth.password_reset_*`, `auth.identity_linked`, `auth.identity_unlinked`
- `project.created`, `project.updated`, `project.cancelled`
- `invitation.created`, `invitation.accepted`, `invitation.revoked`
- `contract.proposed`, `contract.accepted`
- `compensation.proposed`, `compensation.accepted`
- `milestone.submitted`, `milestone.approved`
- `funding.initiated`, `funding.provider_confirmed`, `funding.failed`
- `dispute.opened`, `dispute.message`, `dispute.reviewed`
- `profile.updated`, `preferences.updated`
- `privacy.export_generated`, `privacy.account_deleted`
- `ai.<assistant_type>`

Metadata is stored as JSON string. Tokens, passwords, and session secrets are NEVER included.

## Indices

Key indices for query performance:
- `User.email`, `User.emailNormalized` — unique
- `UserIdentity.(provider, providerSubject)` — unique
- `ProjectMembership.(projectId, userId)` — unique
- `Invitation.tokenHash` — unique (lookup by token)
- `EmailVerificationToken.tokenHash`, `PasswordResetToken.tokenHash` — unique
- `FundingRecord.idempotencyKey`, `FundingRecord.providerTxRef` — unique (idempotency)
- `WebhookEvent.providerEventId` — unique (replay protection)
- `AuditEvent.actorId`, `AuditEvent.projectId` — for log queries

## Migrations

In dev, we use `prisma db push` (destructive but fast). In production:
```bash
bun run db:migrate --name descriptive_change_name
```
Migrations are versioned in `prisma/migrations/` and reviewed in PRs.

## Data retention

- Personal data: deleted on account deletion (PII anonymized, email replaced with `deleted+xxx@gigsure.invalid`)
- Financial records: retained indefinitely for accounting/legal reasons (anonymized)
- Audit events: retained indefinitely
- AI activity logs: prompt body sanitised (no PII) — retained 90 days, then auto-purged (TODO)
- Email verification tokens: consumed/expired tokens purged weekly (TODO)
- Sessions: expire 7d after issue, purged on logout

## Backup

For SQLite: simply copy the `db/custom.db` file (after stopping the server, or use `VACUUM INTO`).
For PostgreSQL: `pg_dump` daily, plus point-in-time-recovery (PITR) for production.
