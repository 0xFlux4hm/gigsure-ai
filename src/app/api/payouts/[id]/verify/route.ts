/**
 * Manually poll a payout's status from the provider.
 *
 * POST /api/payouts/[id]/verify
 *
 * This is a fallback for when webhooks aren't being delivered. The platform
 * should normally rely on webhooks; this endpoint is for admin/operator use
 * when investigating stuck payouts.
 */
import { db } from "@/lib/db";
import { apiRoute, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { getProvider } from "@/lib/payments/registry";
import { recordAuditEvent, logSecurityEvent } from "@/lib/auth/audit";
import { isValidTransition } from "@/lib/payments/provider-interface";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (_req, { params }) => {
  const userId = await requireUserId();
  const id = params.id;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (user?.platformRole !== "ADMIN") {
    return fail("Admin access required to manually verify payouts.", 403);
  }

  const payout = await db.payout.findUnique({
    where: { id },
    select: {
      id: true,
      payoutReference: true,
      provider: true,
      providerReference: true,
      status: true,
      amountMinor: true,
      currency: true,
      projectId: true,
      milestoneId: true,
    },
  });
  if (!payout) return fail("Payout not found", 404);
  if (!payout.providerReference) {
    return fail("Payout has no provider reference to verify.", 400);
  }

  const provider = getProvider(payout.provider as "monnify" | "opay");
  if (!provider.verifyTransfer) {
    return fail(`Provider ${payout.provider} does not support transfer verification.`, 400);
  }

  try {
    const result = await provider.verifyTransfer(payout.providerReference);

    // Apply state machine validation.
    const fromStatus = payout.status;
    const toStatus = result.status;
    let newStatus = fromStatus;
    let settledAt: Date | undefined;
    let failedAt: Date | undefined;
    let failureReason: string | undefined;

    if (fromStatus === toStatus) {
      // No change — keep current values.
    } else if (isValidTransition(fromStatus as never, toStatus as never)) {
      newStatus = toStatus;
      if (toStatus === "SUCCEEDED") settledAt = result.settledAt ?? new Date();
      if (toStatus === "FAILED") {
        failedAt = new Date();
        failureReason = result.failureReason ?? "Provider reported failure";
      }
    } else {
      logSecurityEvent("warn", "payout.invalid_transition", {
        payoutId: id,
        from: fromStatus,
        to: toStatus,
      });
      // Skip update — keep current state.
    }

    if (newStatus !== fromStatus) {
      await db.payout.update({
        where: { id },
        data: {
          status: newStatus,
          settledAt,
          failedAt,
          failureReason,
        },
      });

      // If milestone-bound, advance milestone state.
      if (payout.milestoneId && newStatus === "SUCCEEDED") {
        await db.milestone.update({
          where: { id: payout.milestoneId },
          data: { status: "RELEASED" },
        });
      }

      await recordAuditEvent({
        actorId: userId,
        projectId: payout.projectId,
        payoutId: id,
        action: "payout.status_verified",
        targetType: "Payout",
        targetId: id,
        metadata: { from: fromStatus, to: newStatus, provider: payout.provider },
      });
    }

    return {
      payoutId: id,
      previousStatus: fromStatus,
      currentStatus: newStatus,
      providerStatus: toStatus,
      settledAt,
      failureReason,
    };
  } catch (err) {
    logSecurityEvent("error", "payout.verify_failed", {
      payoutId: id,
      message: (err as Error)?.message,
    });
    return fail("Failed to verify payout with provider.", 502);
  }
});
