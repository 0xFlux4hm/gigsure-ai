/**
 * Complete Google OAuth registration.
 *
 * Called by new Google users after they've reviewed their profile info
 * and accepted the Terms of Service on the GoogleRegistrationView page.
 *
 * Flow:
 *   1. User clicks "Continue with Google"
 *   2. Google shows consent screen → user grants consent
 *   3. Platform creates account with PENDING_REGISTRATION status
 *   4. User is redirected to the registration page (not dashboard)
 *   5. User reviews their info + accepts Terms of Service
 *   6. This endpoint is called → accountStatus becomes ACTIVE
 *   7. Frontend redirects to dashboard
 *
 * Body: { acceptedTerms: true }
 */
import { db } from "@/lib/db";
import { apiRoute, parseJsonBody, fail, ok } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/auth/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  acceptedTerms: z.literal(true),
});

export const POST = apiRoute(async (req) => {
  const userId = await requireUserId();

  // Verify the user is in PENDING_REGISTRATION state
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, accountStatus: true, email: true, displayName: true },
  });

  if (!user) return fail("User not found", 404);

  if (user.accountStatus === "ACTIVE") {
    return fail("Account is already active.", 400);
  }

  if (user.accountStatus !== "PENDING_REGISTRATION") {
    return fail(`Cannot complete registration: account status is ${user.accountStatus}`, 400);
  }

  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return fail("You must accept the Terms of Service to continue.", 422);
  }

  // Activate the account
  await db.user.update({
    where: { id: userId },
    data: { accountStatus: "ACTIVE" },
  });

  await recordAuditEvent({
    actorId: userId,
    action: "auth.registration_completed",
    targetType: "User",
    targetId: userId,
    metadata: {
      provider: "google",
      email: user.email,
      termsAccepted: true,
    },
  });

  return ok({
    activated: true,
    message: "Account activated. Redirecting to dashboard...",
  });
});
