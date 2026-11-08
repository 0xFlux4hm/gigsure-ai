/**
 * Notification helper — centralizes notification creation so every state
 * transition in the platform can notify the relevant user(s) consistently.
 *
 * Usage:
 *   import { notifyUser, notifyProjectMembers } from "@/lib/notifications";
 *   await notifyUser({ userId, projectId, type: "MILESTONE_FUNDED", title, body });
 */
import { db } from "@/lib/db";

export type NotificationType =
  | "MILESTONE_FUNDED"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "MILESTONE_RELEASED"
  | "MILESTONE_CHANGES_REQUESTED"
  | "PAYOUT_SUCCEEDED"
  | "PAYOUT_FAILED"
  | "EXPENSE_REQUESTED"
  | "EXPENSE_APPROVED"
  | "EXPENSE_RELEASED"
  | "EXPENSE_REJECTED"
  | "DISPUTE_OPENED"
  | "DISPUTE_MESSAGE"
  | "DISPUTE_REVIEWED"
  | "CONTRACT_PROPOSED"
  | "CONTRACT_ACCEPTED"
  | "COMPENSATION_PROPOSED"
  | "COMPENSATION_ACCEPTED"
  | "TASK_ASSIGNED"
  | "PROJECT_COMPLETED"
  | "INVITATION_SENT"
  | "INVITATION_ACCEPTED"
  | "INVITATION_DECLINED"
  | "INVITATION_REVOKED"
  | "INVITATION_EXPIRED"
  | "INVITATION_RESENT"
  | "MEMBER_REMOVED"
  | "MEMBER_ROLE_CHANGED"
  | "PAYMENT"
  | "GENERAL";

type NotifyInput = {
  userId: string;
  projectId?: string;
  type: NotificationType;
  title: string;
  body: string;
};

export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
      },
    });
  } catch (err) {
    // Notifications should never break the main flow — just log
    console.error("[notifications] failed to create:", err);
  }
}

/**
 * Notify all members of a project (except the actor).
 */
export async function notifyProjectMembers(
  projectId: string,
  excludeUserId: string | null | undefined,
  input: Omit<NotifyInput, "userId" | "projectId">,
): Promise<void> {
  try {
    const members = await db.projectMembership.findMany({
      where: { projectId, revokedAt: null, ...(excludeUserId ? { userId: { not: excludeUserId } } : {}) },
      select: { userId: true },
    });
    await Promise.all(
      members.map((m) =>
        notifyUser({ ...input, userId: m.userId, projectId }),
      ),
    );
  } catch (err) {
    console.error("[notifications] failed to notify project members:", err);
  }
}

/**
 * Notify a specific user about a payout.
 */
export async function notifyPayout(
  userId: string,
  projectId: string,
  status: "SUCCEEDED" | "FAILED",
  amountMinor: number,
  currency: string,
): Promise<void> {
  const amount = (amountMinor / 100).toLocaleString("en-NG", {
    style: "currency",
    currency,
  });
  await notifyUser({
    userId,
    projectId,
    type: status === "SUCCEEDED" ? "PAYOUT_SUCCEEDED" : "PAYOUT_FAILED",
    title: status === "SUCCEEDED" ? "Payout received" : "Payout failed",
    body:
      status === "SUCCEEDED"
        ? `Your payout of ${amount} has been sent to your bank account.`
        : `Your payout of ${amount} failed. Please check your bank details in Settings → Payouts.`,
  });
}
