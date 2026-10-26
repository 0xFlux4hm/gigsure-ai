/**
 * Security regression test for the post-registration redirect bug.
 *
 * Bug summary (now fixed):
 *   /api/auth/complete-registration used to set `passwordChangedAt = new Date()`
 *   when activating a PENDING_REGISTRATION Google user. NextAuth v4's jwt()
 *   callback compares `passwordChangedAt > token.issuedAt` and returns
 *   `{ ...token, userId: undefined }` to invalidate the JWT. But NextAuth v4
 *   does NOT auto-issue a fresh JWT in this case — the user is simply logged
 *   out on their next /api/auth/session fetch. Net effect: a new Google user
 *   accepted the ToS, was redirected to /?view=dashboard, and bounced back
 *   to the login page with no session.
 *
 * Fix:
 *   - complete-registration no longer bumps passwordChangedAt. The jwt()
 *     callback already re-reads accountStatus from the DB on every request,
 *     so the PENDING_REGISTRATION → ACTIVE transition is reflected in the
 *     session automatically.
 *   - GoogleRegistrationView calls `await useSession().update()` to refresh
 *     the cached client session in-band before navigating to the dashboard,
 *     so the Router in app/page.tsx sees the new ACTIVE status.
 *
 * This test verifies the server-side half of the fix:
 *   1. Activating a PENDING_REGISTRATION user sets accountStatus = ACTIVE.
 *   2. Activating does NOT bump passwordChangedAt (the bug).
 *   3. The response is { activated: true }.
 *   4. An audit event is recorded.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

// Stub requireUserId BEFORE importing the route handler.
// The route handler module imports `requireUserId` from @/lib/auth/session
// at module-eval time, so the mock must be in place first.
const TEST_USER_ID_HOLDER: { value: string | null } = { value: null };
vi.mock("@/lib/auth/session", () => ({
  requireUserId: async () => {
    if (!TEST_USER_ID_HOLDER.value) throw new Error("TEST_USER_ID_HOLDER not set");
    return TEST_USER_ID_HOLDER.value;
  },
}));

// Import after mocks are in place.
import { db } from "@/lib/db";
import { POST } from "@/app/api/auth/complete-registration/route";

// Empty params context for the route handler (no dynamic route segments).
const EMPTY_CTX = { params: Promise.resolve({}) };

async function makePendingGoogleUser() {
  const email = `google-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const user = await db.user.create({
    data: {
      email,
      emailNormalized: email,
      displayName: "Google Test User",
      passwordHash: null, // Google OAuth — no password
      emailVerifiedAt: new Date(),
      accountStatus: "PENDING_REGISTRATION",
    },
  });
  await db.userIdentity.create({
    data: {
      userId: user.id,
      provider: "google",
      providerSubject: `google-sub-${user.id}`,
      lastAuthenticatedAt: new Date(),
    },
  });
  return user;
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/complete-registration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("complete-registration: does NOT bump passwordChangedAt (redirect bug fix)", () => {
  beforeAll(() => {
    // Sanity: ensure the route handler exists.
    expect(typeof POST).toBe("function");
  });

  it("activates a PENDING_REGISTRATION account without invalidating the JWT", async () => {
    // 1. Create a pending Google user.
    const user = await makePendingGoogleUser();
    TEST_USER_ID_HOLDER.value = user.id;

    // 2. Capture the original passwordChangedAt (should be null for a
    //    freshly-created Google-only account).
    const before = await db.user.findUnique({
      where: { id: user.id },
      select: { accountStatus: true, passwordChangedAt: true },
    });
    expect(before?.accountStatus).toBe("PENDING_REGISTRATION");
    expect(before?.passwordChangedAt).toBeNull();

    // 3. Invoke the route handler with a valid acceptedTerms body.
    const res = await POST(jsonReq({ acceptedTerms: true }), EMPTY_CTX);

    // 4. Response should be 200 with { activated: true }.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.activated).toBe(true);

    // 5. CRITICAL: passwordChangedAt must NOT have been bumped.
    //    This is the regression — the old code set it to `new Date()`,
    //    which caused the next jwt() callback to invalidate the user's
    //    session and bounce them back to login.
    const after = await db.user.findUnique({
      where: { id: user.id },
      select: { accountStatus: true, passwordChangedAt: true },
    });
    expect(after?.accountStatus).toBe("ACTIVE");
    expect(after?.passwordChangedAt).toBeNull(); // ← unchanged from `before`
  });

  it("rejects when terms are not accepted", async () => {
    const user = await makePendingGoogleUser();
    TEST_USER_ID_HOLDER.value = user.id;

    const res = await POST(jsonReq({ acceptedTerms: false }), EMPTY_CTX);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/terms/i);

    // Account should remain PENDING_REGISTRATION.
    const after = await db.user.findUnique({
      where: { id: user.id },
      select: { accountStatus: true },
    });
    expect(after?.accountStatus).toBe("PENDING_REGISTRATION");
  });

  it("rejects when called by an already-ACTIVE user", async () => {
    const user = await makePendingGoogleUser();
    // Activate the user first.
    await db.user.update({
      where: { id: user.id },
      data: { accountStatus: "ACTIVE" },
    });
    TEST_USER_ID_HOLDER.value = user.id;

    const res = await POST(jsonReq({ acceptedTerms: true }), EMPTY_CTX);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/already active/i);
  });

  it("records an audit event on activation (PostgreSQL only)", async () => {
    // NOTE: recordAuditEvent uses `pg_advisory_xact_lock` (audit.ts:121),
    // a PostgreSQL-only function. SQLite test environments (which CI uses
    // per .github/workflows/ci.yml) can't run this path. We detect the
    // environment and skip the assertion gracefully — the audit-log
    // behavior is covered by integration tests against PostgreSQL.
    const isPostgres = (process.env.TEST_DATABASE_URL ?? "").startsWith("postgres");
    if (!isPostgres) {
      // Smoke test: just verify the route doesn't throw on SQLite.
      const user = await makePendingGoogleUser();
      TEST_USER_ID_HOLDER.value = user.id;
      const res = await POST(jsonReq({ acceptedTerms: true }), EMPTY_CTX);
      expect(res.status).toBe(200);
      return;
    }

    const user = await makePendingGoogleUser();
    TEST_USER_ID_HOLDER.value = user.id;

    await POST(jsonReq({ acceptedTerms: true }), EMPTY_CTX);

    const auditEvents = await db.auditEvent.findMany({
      where: { actorId: user.id, action: "auth.registration_completed" },
    });
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0].metadata).toMatchObject({
      provider: "google",
      termsAccepted: true,
    });
  });
});
