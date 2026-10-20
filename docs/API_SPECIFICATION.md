# GigSure AI — API Specification

Auto-generated OpenAPI is available at `/api/auth/...` for NextAuth routes; this document describes the custom routes.

## Conventions

- All routes return JSON: `{ ok: true, data: ... }` on success, `{ ok: false, error: "..." }` on failure.
- All protected routes require a valid NextAuth session cookie.
- All `POST`/`PATCH`/`PUT` bodies are JSON with `Content-Type: application/json`.
- IDs are CUIDs (24+ chars).
- Timestamps are ISO 8601 UTC.
- Amounts are integer minor units (e.g., NGN kobo: ₦500 → 50000).

## Authentication

### POST /api/auth/register
Body: `{ email, displayName, password, termsAccepted: true }`
Response: `{ created, userId?, verificationUrl? (dev only), message }`

### POST /api/auth/verify-email
Body: `{ token }`
Response: `{ verified: true }`

### POST /api/auth/resend-verification
Body: `{ email }`
Response: `{ sent: true, message }`

### POST /api/auth/forgot-password
Body: `{ email }`
Response: `{ sent: true, message }`

### POST /api/auth/reset-password
Body: `{ token, newPassword }`
Response: `{ reset: true, message }`

### POST /api/auth/change-password  (auth required)
Body: `{ currentPassword, newPassword }`
Response: `{ changed: true, message }`

### POST /api/auth/link-google  (auth required)
Body: `{ googleSub, email }`
Response: `{ linked: true }`

### POST /api/auth/unlink-google  (auth required)
Body: `{ provider: "google", providerSubject }`
Response: `{ unlinked: true }`

### GET /api/auth/google-demo/start
Redirect: `/?view=google-demo-consent&state=<state>`

### POST /api/auth/google-demo/callback?state=<state>
Body: `{ consentEmail, consentName }`
Response: `{ code, redirect_uri }`

### GET /api/auth/google-demo/userinfo
Header: `Authorization: Bearer <code>`
Response: `{ sub, email, name, email_verified }`

## User

### GET /api/me
Response: User + profile + preferences + identities

### GET /api/profile
Response: UserProfile

### PUT /api/profile
Body: ProfileSchema (see source)
Response: updated UserProfile

### GET /api/settings
Response: UserPreferences

### PUT /api/settings
Body: Partial preferences
Response: updated UserPreferences

## Projects

### GET /api/projects?limit=50&offset=0
Response: `{ projects: [...] }` — only projects the user is a member of

### POST /api/projects
Body: `{ title, description, clientId?, currency, budget, fundingArrangement, startDate?, dueDate? }`
Response: Project

### GET /api/projects/[id]
Response: Project + recentContracts + latestCompensation + myRole

### PATCH /api/projects/[id]
Body: Partial update
Response: Project

### DELETE /api/projects/[id]
Response: `{ cancelled: true }` (soft-delete via status=CANCELLED)

### GET /api/projects/[id]/members
Response: `{ members: [...] }`

## Contracts

### GET /api/projects/[id]/contracts
Response: `{ versions: [...] }`

### POST /api/projects/[id]/contracts
Body: ContractSchema
Response: ContractVersion

### POST /api/projects/[id]/contracts/[versionId]/accept
Response: `{ accepted: true, allAccepted: boolean }`

## Invitations

### GET /api/projects/[id]/invitations
Response: `{ invitations: [...] }`

### POST /api/projects/[id]/invitations
Body: `{ inviteeEmail?, inviteeId?, role, expiresInSeconds? }`
Response: `{ invitationId, inviteUrl? (dev), message }`

### DELETE /api/projects/[id]/invitations/[invitationId]
Response: `{ revoked: true }`

### GET /api/invitations/[token]
Response: InvitationInfo (public — no auth required to view)

### POST /api/invitations/[token]
Body: `{ token, decision: "ACCEPT" | "REJECT" }`
Response: `{ ok, decision, projectId? }`

## Tasks

### GET /api/projects/[id]/tasks
Response: `{ tasks: [...] }`

### POST /api/projects/[id]/tasks
Body: `{ title, description, assigneeId?, milestoneId?, priority, dueDate?, dependsOn? }`
Response: Task

### PATCH /api/projects/[id]/tasks/[taskId]
Body: Partial task update (status, title, assigneeId, etc.)
Response: Task

## Compensation

### GET /api/projects/[id]/compensation
Response: `{ agreements: [...] }`

### POST /api/projects/[id]/compensation
Body: `{ totalDistributable, currency, allocations[], enforceTotalMatch?, notes? }`
Response: CompensationAgreement

### POST /api/projects/[id]/compensation/[agreementId]/accept
Response: `{ accepted: true, allAccepted: boolean }`

## Milestones

### GET /api/projects/[id]/milestones
Response: `{ milestones: [...] }`

### POST /api/projects/[id]/milestones
Body: `{ title, description?, amountMinor, dueDate?, orderIndex? }`
Response: Milestone

### POST /api/projects/[id]/milestones/[milestoneId]/submit
Response: `{ submitted: true }`

### POST /api/projects/[id]/milestones/[milestoneId]/approve
Body: `{ decision: "APPROVED" | "CHANGES_REQUESTED", note? }`
Response: `{ status }`

## Funding

### GET /api/projects/[id]/funding
Response: `{ fundingRecords: [...] }`

### POST /api/projects/[id]/funding
Body: `{ type: "FUNDING" | "RELEASE" | "REFUND", milestoneId?, amountMinor, idempotencyKey? }`
Response: `{ fundingRecordId, providerTxRef, status, isSimulated: true, message }`

## Payments

### POST /api/payments/webhook
Headers: `x-gigsure-signature: <HMAC-SHA256>`, `x-gigsure-provider: mock`, `x-gigsure-simulated: true`
Body: provider-specific JSON
Response: `{ ok, processed, reason? }`

## Disputes

### GET /api/projects/[id]/disputes
Response: `{ disputes: [...] }` (reviewers see only assigned disputes)

### POST /api/projects/[id]/disputes
Body: `{ title, description, category, milestoneId? }`
Response: Dispute

### GET /api/projects/[id]/disputes/[disputeId]
Response: Dispute + evidence + messages + reviews

### POST /api/projects/[id]/disputes/[disputeId]/messages
Body: `{ body }`
Response: DisputeMessage

### POST /api/projects/[id]/disputes/[disputeId]/reviews
Body: `{ note?, proposedResolution?, outcome? }`
Response: DisputeReview

## AI

### POST /api/ai/assistant
Body: `{ assistant, prompt, projectId? }`
Response: `{ assistant, name, response, advisoryOnly: true, fallbackUsed, tokensUsed, activityId }`

## Notifications

### GET /api/notifications?limit=50&offset=0&unread=1
Response: `{ notifications, unreadCount }`

### POST /api/notifications/[id]/read
Response: `{ read: true }`

## Privacy

### POST /api/privacy/export
Response: `{ exportId, data: {...} }` — JSON snapshot of user's data

### POST /api/privacy/delete
Body: `{ confirmPhrase: "DELETE MY ACCOUNT", currentPassword? }`
Response: `{ deleted: true, message }`

## Audit

### GET /api/audit?limit=100&offset=0
Response: `{ events: [...] }`

## Status codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 400 | Bad request (validation failed) |
| 401 | Authentication required |
| 403 | Forbidden (authorization failed) |
| 404 | Not found |
| 409 | Conflict (e.g., already accepted, identity in use) |
| 422 | Validation error (Zod schema mismatch) |
| 429 | Rate limited |
| 500 | Internal server error (no stack trace leaked) |

## Rate limits

- `POST /api/auth/forgot-password`: 3 per 10 min per email
- `POST /api/auth/resend-verification`: 3 per 10 min per email
- `POST /api/ai/assistant`: TODO (30s timeout per request; rate-limit counter TODO)
- All other routes: TODO (recommended: 100 req/min per IP for unauthenticated, 1000 req/min per user for authenticated)
