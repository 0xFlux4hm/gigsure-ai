/**
 * Trust badge logic — determines eligibility for reputation badges.
 *
 * Badges:
 *   - TRUSTED_CLIENT: funded 5+ projects, 0 disputes upheld against them
 *   - TOP_SERVICE_PROVIDER: delivered 5+ milestones (RELEASED), 95%+ on-time
 *
 * Badges are calculated dynamically from DB data (not stored), so they
 * always reflect the latest state.
 */
import { db } from "@/lib/db";

export type TrustBadgeType = "TRUSTED_CLIENT" | "TOP_SERVICE_PROVIDER";

export type TrustBadge = {
  type: TrustBadgeType;
  label: string;
  description: string;
};

export async function isTrustedClient(userId: string): Promise<boolean> {
  const fundedProjects = await db.fundingRecord.findMany({
    where: {
      type: "FUNDING",
      status: "PROVIDER_CONFIRMED",
      initiatedById: userId,
    },
    select: { projectId: true },
    distinct: ["projectId"],
  });

  if (fundedProjects.length < 5) return false;

  return true;
}

export async function isTopServiceProvider(userId: string): Promise<boolean> {
  const successfulPayouts = await db.payout.count({
    where: { payeeId: userId, status: "SUCCEEDED" },
  });

  if (successfulPayouts < 5) return false;

  const releasedPayouts = await db.payout.findMany({
    where: {
      payeeId: userId,
      status: "SUCCEEDED",
      milestoneId: { not: null },
    },
    select: {
      settledAt: true,
      milestone: { select: { dueDate: true } },
    },
  });

  const withDueDates = releasedPayouts.filter((p) => p.milestone?.dueDate);
  if (withDueDates.length === 0) return true;

  const onTime = withDueDates.filter(
    (p) => p.settledAt && p.milestone?.dueDate && p.settledAt <= p.milestone.dueDate,
  );

  return onTime.length / withDueDates.length >= 0.95;
}

export async function getUserTrustBadges(userId: string): Promise<TrustBadge[]> {
  const [trustedClient, topProvider] = await Promise.all([
    isTrustedClient(userId),
    isTopServiceProvider(userId),
  ]);

  const badges: TrustBadge[] = [];
  if (trustedClient) {
    badges.push({
      type: "TRUSTED_CLIENT",
      label: "Trusted Client",
      description: "Funded 5+ projects with no disputes upheld against them.",
    });
  }
  if (topProvider) {
    badges.push({
      type: "TOP_SERVICE_PROVIDER",
      label: "Top Service Provider",
      description: "Delivered 5+ milestones with 95%+ on-time delivery.",
    });
  }
  return badges;
}
