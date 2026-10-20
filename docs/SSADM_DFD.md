# GigSure AI — SSADM Data Flow Diagrams

## Notation
- `[ ]` = External entity
- `( )` = Process
- `{ }` = Data store
- `→` = Data flow
- Numbers in parentheses are process IDs per SSADM convention

## Level 0 — Context Diagram

```
                  ┌───────────────────────┐
                  │  [Freelancer/Owner]    │
                  └──────────┬──────────────┘
                             │ project details, contracts, invitations
                             ▼
   ┌──────────────────┐    (0) GigSure AI    ┌──────────────────┐
   │   [Client]       │◄───────────────────►│  [Collaborator]  │
   │   reviews, pays   │   accept, deliver    │   accepts, works │
   └──────────────────┘                       └──────────────────┘
                             │
                             ▼
                  ┌───────────────────────┐
                  │  [Independent Reviewer]│
                  └──────────┬──────────────┘
                             │ reviews disputes only
                             ▼
            ┌────────────────────┐
            │ [Google OIDC]       │
            │ [Email Provider]    │
            │ [Payment Provider]  │
            │ [AI Provider]       │
            └────────────────────┘
```

## Level 1 — Major Processes

```
                                    ┌─────────────────────┐
                                    │  {Users & Identities}│
                                    └──────────┬──────────┘
                                               │
   [User] ──credentials──► (1) Authentication ──► session JWT
                              │
                              │ user identity
                              ▼
   [User] ──profile──► (2) User Profile Mgmt ──► {Profiles & Prefs}
                              │
   [Owner] ──creates──► (3) Project Management ──► {Projects}
                              │                       │
   [Owner] ──invites──►  (4) Team & Invitations ─► {Memberships, Invitations}
                              │
   [Owner/Client] ──drafts/accepts──► (5) Contract Mgmt ──► {Contract Versions, Acceptances}
                              │
   [Collaborator] ──works──► (6) Tasks & Deliverables ──► {Tasks, Deliverables}
                              │
   [Owner] ──proposes──► (7) Compensation Mgmt ──► {Agreements, Allocations, Acceptances}
                              │
   [Owner/Client] ──funds/approves──► (8) Funding & Payment Coordination ──► {Milestones, FundingRecords, Webhooks}
                              │
   [Participant] ──opens──► (9) Dispute Management ──► {Disputes, Evidence, Messages, Reviews}
                              │
   [User] ──asks──► (10) AI Assistance ──► {AiActivity}  →  [AI Provider]
                              │
                              └──► (11) Audit & Notifications ──► {AuditEvents, Notifications}
```

## Level 2 — Authentication & Account Linking

```
[User] ──email/pwd──► (1.1) Validate credentials
                          │
                          ├──► verify scrypt hash ──► {User.passwordHash}
                          │
                          └──► on success: issue JWT session
                                                  │
[User] ──Google ID token──► (1.2) Google OIDC verify
                          │
                          ├──► verify signature w/ Google JWKS ──► [Google OIDC]
                          ├──► extract sub + email_verified
                          ├──► lookup {UserIdentity} by (provider, sub)
                          │       │
                          │       └──► if exists: link to that user
                          │       └──► if not exists: create new user (or fail → prompt link flow)
                          │
                          └──► issue JWT session

[Authenticated user] ──link request──► (1.3) Account Linking
                          │
                          ├──► verify user is signed in (re-authentication)
                          ├──► check (provider, sub) not already linked elsewhere
                          ├──► transactional insert into {UserIdentity} + {LinkedAccount}
                          └──► audit event

[User] ──forgot password──► (1.4) Password Reset
                          │
                          ├──► generate token (32B random, hash stored)
                          ├──► email link (in dev: log only)
                          │
   [User] ──token + new pwd──► verify hash + expiry + consumed
                          │
                          └──► transactional: consume token, update hash, notify user, audit
```

## Level 2 — Project Collaboration & Invitations

```
[Owner] ──creates project──► (3.1) Create Project
                                │
                                ├──► generate unique slug
                                ├──► transactional create {Project} + OWNER {ProjectMembership}
                                └──► audit event

[Owner] ──invites email──► (4.1) Create Invitation
                                │
                                ├──► generate random token (32B), store SHA-256 hash
                                ├──► bound to project + role + recipient (optional)
                                └──► return raw token (in dev: surface link)

[Invitee] ──accepts token──► (4.2) Accept Invitation  (concurrent-safe)
                                │
                                ├──► verify token hash + not expired + not consumed
                                ├──► verify invitee matches bound user (if bound)
                                ├──► TRANSACTION:
                                │     - check no existing membership
                                │     - create {ProjectMembership}
                                │     - mark invitation ACCEPTED + consumedAt
                                │     - create welcome notification
                                └──► audit event
```

## Level 2 — Contracts & Compensation

```
[Owner/TeamLead] ──drafts──► (5.1) Create Contract Version
                                │
                                ├──► compute next versionNumber (last + 1)
                                ├──► if prior version ACCEPTED: mark SUPERSEDED (preserved, not deleted)
                                ├──► insert {ContractVersion} status=PROPOSED
                                └──► audit event

[Member] ──accepts──► (5.2) Accept Contract Version
                                │
                                ├──► verify not already accepted
                                ├──► insert {ContractAcceptance}
                                ├──► if all required parties accepted:
                                │     - mark prior ACCEPTED versions SUPERSEDED
                                │     - mark this version ACCEPTED
                                │     - set project.currentContractVersionId
                                └──► audit event

[Owner] ──proposes allocations──► (7.1) Create Compensation Agreement
                                │
                                ├──► validate sum(allocations) == totalDistributable (if enforced)
                                ├──► validate all recipients are project members
                                ├──► transactional:
                                │     - mark prior ACCEPTED agreement SUPERSEDED
                                │     - create {CompensationAgreement} status=PROPOSED
                                │     - create {CompensationAllocation} per recipient
                                └──► audit event

[Recipient] ──accepts own allocation──► (7.2) Accept Compensation
                                │
                                ├──>> verify user has allocation in this agreement
                                ├──>> insert {CompensationAcceptance}
                                ├──>> if all allocations accepted: mark agreement ACCEPTED
                                └──>> audit event
```

## Level 2 — Funding & Payment Events

```
[Owner] ──initiates funding──► (8.1) Initiate Funding Record
                                │
                                ├──>> generate idempotencyKey + providerTxRef
                                ├──>> check for existing record by idempotencyKey (idempotency)
                                ├──>> insert {FundingRecord} status=INITIATED, isSimulated=true
                                ├──>> audit event
                                └──>> schedule async mock webhook delivery (400ms)

[Mock Provider] ──webhook──► (8.2) Process Webhook
                                │
                                ├──>> verify HMAC-SHA256 signature (shared secret)
                                ├──>> check providerEventId not already processed (replay protection)
                                ├──>> TRANSACTION:
                                │     - insert {WebhookEvent}
                                │     - update {FundingRecord} to PROVIDER_CONFIRMED or FAILED
                                │     - if milestone funding: advance milestone to FUNDED
                                └──>> audit event

[Client] ──approves milestone──► (8.3) Approve Milestone
                                │
                                ├──>> verify milestone is SUBMITTED
                                ├──>> BLOCK if open dispute exists on milestone
                                ├──>> update milestone status to APPROVED
                                └──>> audit event

[Owner] ──initiates release──► (8.4) Initiate Release
                                │
                                ├──>> verify milestone is APPROVED
                                ├──>> BLOCK if open dispute exists on milestone
                                ├──>> call initiateFunding(type=RELEASE)
                                └──>> (webhook confirms release)
```

## Level 2 — Disputes & Evidence

```
[Participant] ──opens dispute──► (9.1) Create Dispute
                                │
                                ├──>> insert {Dispute} status=OPEN
                                ├──>> if milestone-bound: mark milestone DISPUTED (blocks release)
                                └──>> audit event

[Participant] ──posts message──► (9.2) Add Dispute Message
                                │
                                ├──>> verify project membership
                                └──>> insert {DisputeMessage}

[Reviewer] ──records review──► (9.3) Reviewer Note
                                │
                                ├──>> verify reviewer is assigned (or auto-assign on first review)
                                ├──>> upsert {DisputeReview} with proposedResolution + outcome
                                ├──>> if outcome=ESCALATE: mark dispute ESCALATED
                                └──>> AI can summarize evidence but CANNOT make binding decisions
```

## Data Dictionary (key entities)

| Entity | Purpose | Sensitive fields |
|--------|---------|------------------|
| User | Top-level account | email, passwordHash |
| UserIdentity | External auth method mapping | providerSubject (OIDC sub) |
| Session | Server session | sessionToken, csrfToken |
| EmailVerificationToken | Single-use verify token | tokenHash only |
| PasswordResetToken | Single-use reset token | tokenHash only |
| Invitation | Project invite | tokenHash only |
| ContractVersion | Versioned agreement text | none (public-to-members) |
| ContractAcceptance | Per-user acceptance record | none |
| CompensationAllocation | Money owed to user | amountMinor (financial) |
| FundingRecord | Payment transaction | providerTxRef |
| WebhookEvent | Inbound provider webhook | payload (may contain PII) |
| DisputeEvidence | Uploaded file metadata | storageKey |
| AuditEvent | Security-relevant action log | metadata (sanitised) |
| AiActivity | AI prompt/response log | prompt (sanitised) |
| PrivacyRequest | Data export/delete request | result |

## Logical Data Model

See `prisma/schema.prisma` for the complete ER diagram (encoded as Prisma models). Key relationships:

- User (1) — (N) UserIdentity
- User (1) — (1) UserProfile
- User (1) — (1) UserPreferences
- Project (1) — (N) ProjectMembership — (1) User
- Project (1) — (N) ContractVersion — (N) ContractAcceptance — (1) User
- Project (1) — (N) Task — (N) Deliverable
- Project (1) — (N) Milestone — (N) FundingRecord — (N) WebhookEvent
- Project (1) — (N) Dispute — (N) DisputeEvidence, DisputeMessage, DisputeReview
- User (1) — (N) AuditEvent (as actor)
- User (1) — (N) AiActivity
- User (1) — (N) PrivacyRequest
