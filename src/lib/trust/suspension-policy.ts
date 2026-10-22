/**
 * Suspension policy — automatically suspends accounts after repeated
 * dispute violations. Enforced when a dispute review resolves with
 * UPHOLD_CLAIM outcome.
 *
 * Policy: if a user has 3+ disputes upheld against them in the last
 * 90 days, their accountStatus is set to SUSPENDED.
 */
import { db } from "@/lib/db";
import { logSecurityEvent } from "@/lib/auth/audit";
import { notifyUser } from "@/lib/notifications";

const SUSPENSION_THRESHOLD = 3;
const SUSPENSION_WINDOW_DAYS = 90;

/**
 * Check if a user should be auto-suspended based on upheld dispute count.
 * Called after a dispute review with UPHOLD_CLAIM outcome.
 */
export async function checkAutoSuspend(userId: string): Promise<{ suspended: boolean; reason?: string }> {
  // Count disputes upheld against this user in the last 90 days
  const cutoff = new Date(Date.now() - SUSPENSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // A dispute is "upheld against" a user if:
  // - The dispute was opened BY the other party about this user's work
  // - A DisputeReview with outcome UPHOLD_CLAIM exists
  // We count disputes where this user is the "subject" (openedById != userId
  // and the milestone belongs to a project where userId is a service provider)

  const upheldReviews = await db.disputeReview.findMany({
    where: {
      outcome: "UPHOLD_CLAIM",
      decidedAt: { gte: cutoff },
      dispute: {
        openedById: { not: userId },
      },
    },
    include: {
      dispute: {
        select: {
          id: true,
          openedById: true,
          milestoneId: true,
          milestone: { select: { projectId: true } },
        },
      },
    },
  });

  // Check which of these disputes are about milestones on projects where
  // the user is a member (service provider)
  const relevantDisputes: string[] = [];
  for (const review of upheldReviews) {
    if (!review.dispute.milestone?.projectId) continue;
    const membership = await db.projectMembership.findUnique({
      where: {
        projectId_userId: {
          projectId: review.dispute.milestone.projectId,
          userId,
        },
      },
      select: { id: true },
    });
    if (membership) {
      relevantDisputes.push(review.dispute.id);
    }
  }

  if (relevantDisputes.length < SUSPENSION_THRESHOLD) {
    return { suspended: false };
  }

  // Suspend the account
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true },
  });

  if (!user || user.accountStatus === "SUSPENDED") {
    return { suspended: false }; // already suspended or deleted
  }

  await db.user.update({
    where: { id: userId },
    data: { accountStatus: "SUSPENDED" },
  });

  const reason = `Auto-suspended: ${relevantDisputes.length} disputes upheld against this account in the last ${SUSPENSION_WINDOW_DAYS} days.`;

  logSecurityEvent("error", "auth.auto_suspended", {
    userId,
    reason,
    disputeCount: relevantDisputes.length,
  });

  // Notify the user
  await notifyUser({
    userId,
    type: "GENERAL",
    title: "Account suspended",
    body: "Your account has been automatically suspended due to multiple upheld disputes. Contact support to appeal.",
  });

  return { suspended: true, reason };
}
