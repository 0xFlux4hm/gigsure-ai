# GigSure AI — Payment Integration Notes

> Status: **Mock provider only**. Real payment integration is DISABLED until all prerequisites below are met.

## Current state

- `src/lib/payments/mock-provider.ts` implements a simulated payment provider
- Every `FundingRecord` has `isSimulated = true`
- The mock provider:
  - Generates a unique `providerTxRef` + `idempotencyKey` per initiation
  - Returns the same record for duplicate `idempotencyKey` (idempotency)
  - Schedules an async webhook delivery (400ms after initiation)
  - Signs the webhook payload with HMAC-SHA256 + a shared secret
  - Simulates failure if `amountMinor % 1000 === 1` (used by integration tests)
- Webhook handler (`/api/payments/webhook`):
  - Verifies HMAC signature
  - Checks `providerEventId` for replay protection
  - Updates `FundingRecord` status transactionally
  - Advances milestone to `FUNDED` when funding confirms

## Why mock only

Real payment integration requires:

1. **Verified provider account** with Nigerian business registration
2. **Supported transaction types**:
   - For Paystack: one-time payments, transfers, refunds. Split payments supported but require merchant approval.
   - For Flutterwave: similar to Paystack.
3. **Payout capabilities** to Nigerian bank accounts
4. **Split-payment support** (for compensation allocations)
5. **Whether funds can legally be held** for the intended purpose and duration — **escrow requires CBN authorization**, which GigSure AI does NOT have.
6. **Partial release and refund capabilities**
7. **Provider dispute capabilities**
8. **Settlement rules** — typically T+1 to T+3 for Nigerian providers
9. **Fees and limitations** — typically 1.5–3.9% per transaction
10. **Nigerian regulatory review**: CBN guidelines, NDPC data protection, consumer protection

## Critical: NO escrow

GigSure AI **does not** hold customer funds. Even when a real provider is integrated:

- Funds flow directly between client and provider (Paystack/Flutterwave)
- "Milestone funding" means the client authorizes the provider to charge their card or initiate a transfer
- "Milestone release" means the provider transfers funds to the freelancer's bank account
- GigSure AI records the **status** of these provider-mediated transactions but never holds the money

The compensation allocation feature is **internal accounting only** — it documents how the project budget should be split, but it does not move money.

## Provider evaluation checklist (Paystack example)

Before enabling Paystack:

- [ ] Paystack business account verified
- [ ] Test mode credentials in staging environment
- [ ] Live mode credentials in production environment (only after staging verification)
- [ ] Webhook endpoint registered: `https://yourdomain.com/api/payments/webhook`
- [ ] Webhook secret configured (`PAYSTACK_WEBHOOK_SECRET`)
- [ ] Test transaction completed end-to-end in staging
- [ ] Refund flow tested in staging
- [ ] Split payment (subaccount) feature reviewed and approved by Paystack
- [ ] Settlement timeline confirmed (T+1 for Paystack Nigeria)
- [ ] Fee structure documented
- [ ] Disaster recovery: provider outage → fallback messaging, manual reconciliation path
- [ ] Legal review of Paystack Terms of Service
- [ ] CBN-related compliance verified (Paystack is CBN-licensed as a PSP — but confirm scope)
- [ ] NDPC data processing agreement with Paystack

## Webhook signature schemes by provider

| Provider | Header | Algorithm |
|----------|--------|-----------|
| Mock | `x-gigsure-signature` | HMAC-SHA256(payload, MOCK_WEBHOOK_SECRET) |
| Paystack | `x-paystack-signature` | HMAC-SHA512(payload, PAYSTACK_SECRET_KEY) |
| Flutterwave | `verif-hash` | MD5(SECRET_HASH) — note: weaker; verify carefully |

⚠️ Flutterwave's MD5 signature is weaker than HMAC-SHA256/512. Recommend Paystack if available.

## Database changes when real provider enabled

None required. The schema is provider-neutral:
- `FundingRecord.provider` field stores the provider name
- `FundingRecord.providerTxRef` stores the provider's transaction reference
- `FundingRecord.isSimulated` flag distinguishes mock from real

When real provider enabled:
- Mock provider remains for local dev (set `provider = "mock"` in tests)
- Real provider routes (`/api/payments/paystack/initiate`, etc.) added
- Feature flag (`ENABLE_REAL_PAYMENTS=true`) gates production usage

## Idempotency

Every funding initiation accepts an optional `idempotencyKey`. The same key always returns the same `FundingRecord` — preventing duplicate financial outcomes from retried operations (network timeouts, client retries, webhook redelivery).

```typescript
// Even if called 100 times with the same key, only one record is created.
await initiateFunding({ ..., idempotencyKey: "user-abc_milestone-xyz_attempt-1" });
```

## Webhook replay protection

Each inbound webhook includes a `providerEventId`. The handler checks `WebhookEvent.providerEventId` for uniqueness before processing — if already seen, returns `{ processed: false, reason: "duplicate_event" }` without re-executing side effects.

## Reconciliation

For real providers, a daily reconciliation job should:
1. Fetch all `FundingRecord` rows with `status = "INITIATED"` older than 1 hour
2. Query the provider's API for the current status of each
3. Update the record if status changed
4. Alert on discrepancies (e.g., provider shows confirmed but our DB shows initiated)

(TODO: implement when real provider integrated)

## What GigSure AI does NOT claim

- ❌ Holding customer funds (escrow)
- ❌ Money transmitter license
- ❌ CBN authorization as a payment service provider
- ❌ Guaranteeing payment release (depends on provider + legal review)
- ❌ Refund processing (depends on provider capabilities)

## Disabling real payments

Real payments are disabled by default. The `MOCK_WEBHOOK_SECRET` env var is the only payment-related credential in this build. To enable real payments:

1. Complete the provider checklist above
2. Set `ENABLE_REAL_PAYMENTS=true` in production env
3. Set provider-specific credentials (`PAYSTACK_SECRET_KEY`, etc.)
4. Implement the real provider adapter (following the `PaymentProvider` interface)
5. Test end-to-end in staging with test mode credentials
6. Manual verification of a real transaction (small amount) in production
7. Begin gradual rollout (feature flag per user)
