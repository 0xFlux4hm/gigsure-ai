# GigSure AI — Privacy & Compliance

## Privacy by design

GigSure AI applies privacy-by-design principles:

1. **Data minimization**: only essential fields collected (email, display name, password). All profile fields optional except display name.
2. **Purpose limitation**: each data type has a documented purpose (no secondary use without consent).
3. **Storage limitation**: tokens expire; AI activity logs sanitised; account deletion anonymizes PII.
4. **Integrity & confidentiality**: scrypt password hashing, hashed token storage, HTTPS in production, secure cookies.
5. **User rights**: access (data export), rectification (profile edit), erasure (account deletion), portability (JSON export).

## Data inventory

| Category | Examples | Purpose | Retention |
|----------|----------|---------|-----------|
| Identification | email, display name | Account management | Until account deletion (then anonymized) |
| Authentication | password hash, OAuth sub | Sign-in | Until unlinking / account deletion |
| Profile (optional) | headline, bio, skills, country | Profile display | Until account deletion |
| Preferences | currency, notification toggles | UX | Until account deletion |
| Project data | title, description, members | Collaboration | Until project cancellation + 90d |
| Contract versions | scope, deliverables, terms | Legal evidence | Retained indefinitely (anonymized on deletion) |
| Compensation allocations | amountMinor per user | Internal accounting | Retained indefinitely (anonymized) |
| Funding records | amountMinor, status, provider | Financial accounting | Retained indefinitely (anonymized) |
| Audit events | action, target, IP, timestamp | Security & compliance | Retained indefinitely |
| AI activity | sanitised prompt, response, tokens | AI feature logging | 90 days (TODO: auto-purge) |
| Sessions | sessionToken, expiry | Auth | 7d, purged on logout |
| Email verification / password reset tokens | hash, expiry | Auth workflow | 24h / 1h, then purged |

## Data subject rights

| Right | Implementation |
|-------|----------------|
| Access | `/api/privacy/export` returns JSON snapshot of user's data |
| Rectification | `/api/profile` (PUT) updates profile fields |
| Erasure | `/api/privacy/delete` anonymizes PII, revokes sessions, retains financial/audit records |
| Portability | JSON export format is portable |
| Object | Notification preferences in `/api/settings` |
| Withdraw consent | Account deletion or per-feature toggles |

## Account deletion flow

1. User requests deletion with `confirmPhrase = "DELETE MY ACCOUNT"` and (if password set) current password.
2. Server reauthenticates the user (verifies password).
3. Server checks no active projects owned (must complete or transfer first).
4. Server transactionally:
   - Anonymizes User PII (email → `deleted+xxx@gigsure.invalid`, displayName → "Deleted User", passwordHash → null)
   - Sets `accountStatus = DELETED`, `deletedAt = now()`
   - Deletes: `UserIdentity`, `LinkedAccount`, `Session`, `EmailVerificationToken`, `PasswordResetToken`, `UserProfile`, `UserPreferences`, `Notification`
5. Financial records (`FundingRecord`, `CompensationAllocation`, `ContractVersion`) are **retained** for legal/accounting reasons — but the link to the user is via `userId` (which still exists in anonymized form).
6. Audit records retained indefinitely (action history).
7. Records a `privacy.account_deleted` audit event.

## Nigerian regulatory landscape (research summary)

> ⚠️ This is engineering research, NOT legal advice. Production deployment requires review by a qualified Nigerian lawyer and direct consultation with the NDPC and CBN.

### Nigeria Data Protection Act (NDPA) 2023

- Administered by the Nigeria Data Protection Commission (NDPC).
- Applies to processing of personal data of Nigerian residents.
- Key obligations:
  - **Lawful basis**: consent, contract, legal obligation, vital interests, public task, legitimate interests.
  - **Data subject rights**: access, rectification, erasure, portability, objection.
  - **Data Protection Impact Assessment (DPIA)** for high-risk processing.
  - **Data Protection Officer (DPO)** appointment for large-scale processing.
  - **Breach notification** to NDPC and data subjects within 72 hours.
  - **Cross-border transfer** restrictions.
- Sources: [NDPC official site](https://ndpc.gov.ng/), [NDPA full text](https://ndpc.gov.ng/wp-content/uploads/2023/06/NDPA-2023.pdf)

### Central Bank of Nigeria (CBN) — payment-related

- Payment service providers must be licensed by CBN.
- Escrow / funds-holding requires specific authorization (e.g., PSB, MFB, or specialised license).
- GigSure AI does **not** hold customer funds. It coordinates milestones via an external provider (Paystack, Flutterwave, etc.) once integrated.
- Sources: [CBN regulations portal](https://www.cbn.gov.ng/)

### Electronic contracts & signatures

- Nigerian Evidence Act 2011 recognizes electronic records and signatures.
- Contracts must meet basic requirements: offer, acceptance, consideration, capacity, lawful purpose.
- GigSure AI records acceptance events but does not represent them as universally valid legal signatures.

### Tax obligations

- Personal Income Tax (PIT) for freelancers.
- Value Added Tax (VAT) may apply to digital services.
- Withholding Tax (WHT) on certain payments.
- GigSure AI does not compute or remit taxes; users are responsible for their own tax compliance.

## Outstanding legal/regulatory items

| Item | Status |
|------|--------|
| DPIA conducted | ❌ Pending |
| DPO appointed | ❌ Not applicable at current scale |
| NDPC registration | ❌ Pending (required for large-scale processing) |
| CBN approval for any payment-related activity | ❌ Not applicable — GigSure AI is not a payment custodian |
| Terms of Service drafted by Nigerian counsel | ❌ Pending |
| Privacy Notice reviewed | ❌ Pending |
| Cross-border data transfer mechanism (SCCs) | ❌ Pending |
| Breach response plan documented | ❌ Pending |
| Record retention policy finalized | ⚠ Documented above; legal review pending |

## What GigSure AI does NOT claim

- ❌ Licensed by CBN
- ❌ Authorized by NDPC
- ❌ Holding customer funds (escrow)
- ❌ Legally binding electronic signatures
- ❌ Tax-compliant on behalf of users
- ❌ Production-ready

## Production readiness checklist (compliance)

- [ ] DPIA completed and documented
- [ ] Privacy Notice reviewed by counsel
- [ ] Terms of Service reviewed by counsel
- [ ] Data Processing Agreement with each sub-processor (Google, AI provider, payment provider, email provider)
- [ ] Breach response plan documented and tested
- [ ] Cross-border transfer mechanism in place (if applicable)
- [ ] NDPC registration (if scale requires)
- [ ] CBN-related review (if any funds-custody feature is added — currently not applicable)
