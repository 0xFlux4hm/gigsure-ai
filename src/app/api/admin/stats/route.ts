/**
 * Admin: platform-wide statistics.
 *
 * Returns aggregate counts + recent activity for the admin dashboard overview.
 */
import { db } from "@/lib/db";
import { apiRoute, getQueryInt } from "@/lib/api";
import { requireAdminRateLimited } from "@/lib/auth/session";
import { formatMinor } from "@/lib/security/validation";

export const GET = apiRoute(async (req) => {
  const admin = await requireAdminRateLimited();

  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    pendingDeletionUsers,
    totalProjects,
    activeProjects,
    cancelledProjects,
    totalContracts,
    acceptedContracts,
    totalMilestones,
    totalFundingRecords,
    pendingFundingRecords,
    confirmedFundingRecords,
    failedFundingRecords,
    totalDisputes,
    openDisputes,
    resolvedDisputes,
    totalInvitations,
    pendingInvitations,
    totalTasks,
    openTasks,
    totalAiActivities,
    pendingPrivacyRequests,
    totalWebhooks,
    failedWebhookDeliveries,
    totalAuditEvents,
  ] = await Promise.all([
    db.user.count({ where: { accountStatus: { not: "DELETED" } } }),
    db.user.count({ where: { accountStatus: "ACTIVE" } }),
    db.user.count({ where: { accountStatus: "SUSPENDED" } }),
    db.user.count({ where: { accountStatus: "PENDING_DELETION" } }),
    db.project.count(),
    db.project.count({ where: { status: "ACTIVE" } }),
    db.project.count({ where: { status: "CANCELLED" } }),
    db.contractVersion.count(),
    db.contractVersion.count({ where: { status: "ACCEPTED" } }),
    db.milestone.count(),
    db.fundingRecord.count(),
    db.fundingRecord.count({ where: { status: "INITIATED" } }),
    db.fundingRecord.count({ where: { status: "PROVIDER_CONFIRMED" } }),
    db.fundingRecord.count({ where: { status: "FAILED" } }),
    db.dispute.count(),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.dispute.count({ where: { status: "RESOLVED" } }),
    db.invitation.count(),
    db.invitation.count({ where: { status: "PENDING" } }),
    db.task.count(),
    db.task.count({ where: { status: { notIn: ["APPROVED", "CANCELLED"] } } }),
    db.aiActivity.count(),
    db.privacyRequest.count({ where: { status: "PENDING" } }),
    db.webhookEvent.count(),
    db.webhookEvent.count({ where: { signatureValid: false } }),
    db.auditEvent.count(),
  ]);

  // Total confirmed funding volume (sum of amountMinor across all PROVIDER_CONFIRMED records)
  const fundingVolumeAgg = await db.fundingRecord.aggregate({
    _sum: { amountMinor: true },
    where: { status: "PROVIDER_CONFIRMED", type: "FUNDING" },
  });
  const releaseVolumeAgg = await db.fundingRecord.aggregate({
    _sum: { amountMinor: true },
    where: { status: "PROVIDER_CONFIRMED", type: "RELEASE" },
  });

  // Last 7-day signup trend
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentSignups = await db.user.count({
    where: { createdAt: { gte: sevenDaysAgo }, accountStatus: { not: "DELETED" } },
  });
  const recentFunding = await db.fundingRecord.count({
    where: { initiatedAt: { gte: sevenDaysAgo } },
  });
  const recentDisputes = await db.dispute.count({
    where: { createdAt: { gte: sevenDaysAgo } },
  });
  const recentAiCalls = await db.aiActivity.count({
    where: { createdAt: { gte: sevenDaysAgo } },
  });

  // Most recent audit events (top 10)
  const recentAuditEvents = await db.auditEvent.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { id: true, displayName: true, email: true } },
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: admin.displayName,
    counts: {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        pendingDeletion: pendingDeletionUsers,
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
        cancelled: cancelledProjects,
      },
      contracts: {
        total: totalContracts,
        accepted: acceptedContracts,
      },
      milestones: totalMilestones,
      funding: {
        total: totalFundingRecords,
        pending: pendingFundingRecords,
        confirmed: confirmedFundingRecords,
        failed: failedFundingRecords,
        confirmedVolumeMinor: fundingVolumeAgg._sum.amountMinor ?? 0,
        releaseVolumeMinor: releaseVolumeAgg._sum.amountMinor ?? 0,
      },
      disputes: {
        total: totalDisputes,
        open: openDisputes,
        resolved: resolvedDisputes,
      },
      invitations: {
        total: totalInvitations,
        pending: pendingInvitations,
      },
      tasks: {
        total: totalTasks,
        open: openTasks,
      },
      ai: {
        totalActivities: totalAiActivities,
      },
      privacy: {
        pendingRequests: pendingPrivacyRequests,
      },
      webhooks: {
        total: totalWebhooks,
        invalidSignatures: failedWebhookDeliveries,
      },
      auditEvents: totalAuditEvents,
    },
    trends: {
      last7Days: {
        newUsers: recentSignups,
        newFunding: recentFunding,
        newDisputes: recentDisputes,
        aiCalls: recentAiCalls,
      },
    },
    recentAuditEvents,
  };
});
