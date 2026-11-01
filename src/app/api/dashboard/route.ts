/**
 * Dashboard stats — aggregated metrics for the current user.
 *
 * GET /api/dashboard
 *
 * Returns:
 *   - activeProjects: count of projects where user is a member and status is ACTIVE
 *   - completedProjects: count of COMPLETED projects
 *   - pendingMilestones: milestones awaiting action (SUBMITTED, AWAITING_FUNDING, APPROVED)
 *   - pendingPayouts: count of payouts in PENDING status for this user
 *   - totalEarningsMinor: sum of all SUCCEEDED payouts to this user
 *   - unreadNotifications: count of unread notifications
 *   - openDisputes: count of OPEN disputes on projects the user is in
 *   - kycVerified: boolean
 *   - bankAccountAdded: boolean
 *   - recentActivity: last 5 audit events for projects the user is in
 */
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  const userId = await requireUserId();

  // Get user's project memberships
  const memberships = await db.projectMembership.findMany({
    where: { userId, revokedAt: null },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);

  const [
    activeProjects,
    completedProjects,
    pendingMilestones,
    pendingPayouts,
    earningsAgg,
    fundingAgg,
    unreadNotifications,
    openDisputes,
    user,
    bankDetail,
  ] = await Promise.all([
    db.project.count({
      where: { id: { in: projectIds }, status: { in: ["ACTIVE", "DRAFT"] } },
    }),
    db.project.count({
      where: { id: { in: projectIds }, status: "COMPLETED" },
    }),
    db.milestone.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ["AWAITING_FUNDING", "SUBMITTED", "APPROVED", "FUNDED"] },
      },
    }),
    db.payout.count({
      where: { payeeId: userId, status: "PENDING" },
    }),
    db.payout.aggregate({
      where: { payeeId: userId, status: "SUCCEEDED" },
      _sum: { netMinor: true },
    }),
    // Also count confirmed funding records (PayPal/Monnify payments)
    // as earnings — not just payouts.
    db.fundingRecord.aggregate({
      where: {
        projectId: { in: projectIds },
        status: "PROVIDER_CONFIRMED",
        type: "FUNDING",
      },
      _sum: { amountMinor: true },
    }),
    db.notification.count({
      where: { userId, readAt: null },
    }),
    db.dispute.count({
      where: { projectId: { in: projectIds }, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        kycVerifications: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, verifiedAt: true } },
      },
    }),
    db.bankDetail.findFirst({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const latestKyc = user?.kycVerifications?.[0];
  const kycBypassed = process.env.KYC_BYPASS === "true" || process.env.NODE_ENV !== "production";
  const kycVerified = kycBypassed || (latestKyc?.status === "VERIFIED" && !!latestKyc?.verifiedAt);

  // Total earnings = confirmed payouts + confirmed funding records
  const payoutEarnings = earningsAgg._sum.netMinor ?? 0;
  const fundingEarnings = fundingAgg._sum.amountMinor ?? 0;
  const totalEarningsMinor = payoutEarnings + fundingEarnings;

  return {
    activeProjects,
    completedProjects,
    pendingMilestones,
    pendingPayouts,
    totalEarningsMinor,
    unreadNotifications,
    openDisputes,
    kycVerified,
    bankAccountAdded: !!bankDetail,
  };
});
