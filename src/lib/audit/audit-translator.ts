/**
 * Audit action translator — converts internal dotted action strings
 * (e.g. "auth.login_success") into human-readable titles, descriptions,
 * icons, and categories for both user-facing and admin-facing views.
 */

import {
  LogIn, LogOut, UserPlus, KeyRound, MailCheck, ShieldCheck,
  FileText, FolderKanban, CheckSquare, Upload, Scale, Wallet,
  Banknote, CreditCard, Bot, UserCog, Trash2, Settings, Send,
  Users, Star, FileCheck, Receipt, Eye, Target, Link2, Link2Off,
  Activity, type LucideIcon,
} from "lucide-react";

export type AuditCategory =
  | "Authentication" | "Projects" | "Tasks" | "Contracts"
  | "Financial" | "Team" | "AI" | "Account" | "Security" | "System";

export type AuditActionInfo = {
  title: string;
  description: string;
  icon: LucideIcon;
  category: AuditCategory;
  tone: "success" | "info" | "warning" | "destructive";
};

const ACTION_MAP: Record<string, AuditActionInfo> = {
  "auth.login_success": { title: "Signed in", description: "You signed in to your account.", icon: LogIn, category: "Authentication", tone: "success" },
  "auth.google_login": { title: "Signed in with Google", description: "You signed in using your Google account.", icon: LogIn, category: "Authentication", tone: "success" },
  "auth.google_register": { title: "Account created with Google", description: "A new account was created using Google sign-in.", icon: UserPlus, category: "Authentication", tone: "success" },
  "auth.register": { title: "Account created", description: "A new account was registered.", icon: UserPlus, category: "Authentication", tone: "success" },
  "auth.registration_completed": { title: "Registration completed", description: "Account registration was completed.", icon: CheckSquare, category: "Authentication", tone: "success" },
  "auth.email_verified": { title: "Email verified", description: "Email address was verified.", icon: MailCheck, category: "Authentication", tone: "success" },
  "auth.password_set": { title: "Password set", description: "A password was set for the account.", icon: KeyRound, category: "Authentication", tone: "info" },
  "auth.password_changed": { title: "Password changed", description: "Account password was changed.", icon: KeyRound, category: "Security", tone: "warning" },
  "auth.password_reset_requested": { title: "Password reset requested", description: "A password reset link was requested.", icon: KeyRound, category: "Security", tone: "info" },
  "auth.password_reset_completed": { title: "Password reset", description: "Account password was reset.", icon: KeyRound, category: "Security", tone: "warning" },
  "auth.session_revoked": { title: "Session revoked", description: "An active session was signed out.", icon: LogOut, category: "Security", tone: "warning" },
  "auth.identity_linked": { title: "Google account linked", description: "A Google account was linked to this account.", icon: Link2, category: "Account", tone: "info" },
  "auth.identity_unlinked": { title: "Google account unlinked", description: "A Google account was unlinked.", icon: Link2Off, category: "Account", tone: "warning" },
  "project.created": { title: "Project created", description: "A new project was created.", icon: FolderKanban, category: "Projects", tone: "success" },
  "project.updated": { title: "Project updated", description: "Project details were updated.", icon: FolderKanban, category: "Projects", tone: "info" },
  "project.cancelled": { title: "Project cancelled", description: "A project was cancelled.", icon: FolderKanban, category: "Projects", tone: "destructive" },
  "project.completed": { title: "Project completed", description: "A project was marked as completed.", icon: CheckSquare, category: "Projects", tone: "success" },
  "task.created": { title: "Task created", description: "A new task was added to a project.", icon: CheckSquare, category: "Tasks", tone: "success" },
  "task.updated": { title: "Task updated", description: "A task was updated.", icon: CheckSquare, category: "Tasks", tone: "info" },
  "deliverable.uploaded": { title: "Deliverable uploaded", description: "A file was uploaded as a task deliverable.", icon: Upload, category: "Tasks", tone: "success" },
  "deliverable.deleted": { title: "Deliverable deleted", description: "A task deliverable was deleted.", icon: Trash2, category: "Tasks", tone: "destructive" },
  "contract.proposed": { title: "Contract proposed", description: "A new contract version was proposed.", icon: FileText, category: "Contracts", tone: "info" },
  "contract.accepted": { title: "Contract accepted", description: "A contract version was accepted.", icon: FileCheck, category: "Contracts", tone: "success" },
  "compensation.proposed": { title: "Compensation proposed", description: "A compensation agreement was proposed.", icon: Wallet, category: "Financial", tone: "info" },
  "compensation.accepted": { title: "Compensation accepted", description: "A compensation agreement was accepted.", icon: Wallet, category: "Financial", tone: "success" },
  "milestone.created": { title: "Milestone created", description: "A new milestone was added.", icon: Target, category: "Projects", tone: "success" },
  "milestone.submitted": { title: "Milestone submitted", description: "A milestone was submitted for review.", icon: Upload, category: "Projects", tone: "info" },
  "milestone.released": { title: "Milestone payment released", description: "Payment for a milestone was released.", icon: Banknote, category: "Financial", tone: "success" },
  "milestone.approved": { title: "Milestone approved", description: "A milestone was approved.", icon: CheckSquare, category: "Projects", tone: "success" },
  "milestone.changes_requested": { title: "Changes requested", description: "Changes were requested on a milestone.", icon: FileText, category: "Projects", tone: "warning" },
  "milestone.disputed": { title: "Milestone disputed", description: "A milestone was placed under dispute.", icon: Scale, category: "Projects", tone: "destructive" },
  "dispute.opened": { title: "Dispute opened", description: "A dispute was opened on a project.", icon: Scale, category: "Team", tone: "destructive" },
  "dispute.reviewed": { title: "Dispute reviewed", description: "A dispute was reviewed.", icon: Scale, category: "Team", tone: "info" },
  "dispute.message": { title: "Dispute message sent", description: "A message was sent in a dispute.", icon: Send, category: "Team", tone: "info" },
  "feedback.created": { title: "Feedback submitted", description: "Project feedback was submitted.", icon: Star, category: "Team", tone: "info" },
  "virtual_account.created": { title: "Dedicated account created", description: "A dedicated bank account was created for funding.", icon: CreditCard, category: "Financial", tone: "success" },
  "invitation.created": { title: "Invitation sent", description: "An invitation to join a project was sent.", icon: Send, category: "Team", tone: "info" },
  "invitation.resent": { title: "Invitation resent", description: "An invitation was resent.", icon: Send, category: "Team", tone: "info" },
  "invitation.revoked": { title: "Invitation revoked", description: "A pending invitation was revoked.", icon: Trash2, category: "Team", tone: "destructive" },
  "invitation.accepted": { title: "Invitation accepted", description: "A project invitation was accepted.", icon: UserPlus, category: "Team", tone: "success" },
  "invitation.rejected": { title: "Invitation declined", description: "A project invitation was declined.", icon: Users, category: "Team", tone: "warning" },
  "member.role_changed": { title: "Member role changed", description: "A team member's role was updated.", icon: UserCog, category: "Team", tone: "info" },
  "member.removed": { title: "Member removed", description: "A member was removed from a project.", icon: Users, category: "Team", tone: "destructive" },
  "profile.updated": { title: "Profile updated", description: "Profile information was updated.", icon: Settings, category: "Account", tone: "info" },
  "preferences.updated": { title: "Preferences updated", description: "Account preferences were updated.", icon: Settings, category: "Account", tone: "info" },
  "bank_detail.added": { title: "Bank account added", description: "A bank account was added for payouts.", icon: CreditCard, category: "Financial", tone: "success" },
  "bank_detail.updated": { title: "Bank account updated", description: "Bank account details were updated.", icon: CreditCard, category: "Financial", tone: "info" },
  "bank_detail.deleted": { title: "Bank account removed", description: "A bank account was removed.", icon: Trash2, category: "Financial", tone: "destructive" },
  "funding.initiated": { title: "Funding initiated", description: "A funding payment was initiated.", icon: Wallet, category: "Financial", tone: "info" },
  "funding.success": { title: "Payment confirmed", description: "A funding payment was confirmed.", icon: CheckSquare, category: "Financial", tone: "success" },
  "funding.failed": { title: "Payment failed", description: "A funding payment failed.", icon: Wallet, category: "Financial", tone: "destructive" },
  "payout.initiated": { title: "Payout initiated", description: "A payout was initiated.", icon: Banknote, category: "Financial", tone: "info" },
  "payout.failed": { title: "Payout failed", description: "A payout failed to process.", icon: Banknote, category: "Financial", tone: "destructive" },
  "payout.batch_initiated": { title: "Batch payout initiated", description: "Multiple payouts were initiated.", icon: Banknote, category: "Financial", tone: "info" },
  "payout.batch_initiation_failed": { title: "Batch payout failed", description: "A batch payout failed.", icon: Banknote, category: "Financial", tone: "destructive" },
  "payout.status_verified": { title: "Payout verified", description: "A payout status was verified.", icon: Banknote, category: "Financial", tone: "info" },
  "payment.initiated": { title: "Payment started", description: "A payment was started.", icon: CreditCard, category: "Financial", tone: "info" },
  "payment.manual_verify_success": { title: "Payment verified", description: "A payment was manually verified.", icon: CheckSquare, category: "Financial", tone: "success" },
  "expense.requested": { title: "Expense requested", description: "An expense reimbursement was requested.", icon: Receipt, category: "Financial", tone: "info" },
  "expense.approved": { title: "Expense approved", description: "An expense was approved.", icon: CheckSquare, category: "Financial", tone: "success" },
  "expense.rejected": { title: "Expense rejected", description: "An expense was rejected.", icon: Receipt, category: "Financial", tone: "destructive" },
  "expense.released": { title: "Expense released", description: "An expense was released.", icon: Banknote, category: "Financial", tone: "success" },
  "expense.receipt_uploaded": { title: "Receipt uploaded", description: "A receipt was uploaded.", icon: Upload, category: "Financial", tone: "info" },
  "kyc.verified": { title: "Identity verified", description: "Identity verification completed successfully.", icon: ShieldCheck, category: "Security", tone: "success" },
  "kyc.rejected": { title: "Identity verification rejected", description: "Identity verification was rejected.", icon: ShieldCheck, category: "Security", tone: "destructive" },
  "ai.project_brief_generated": { title: "AI project brief generated", description: "AI generated a project brief.", icon: Bot, category: "AI", tone: "info" },
  "ai.contract_analysis": { title: "AI contract analysis", description: "AI analyzed a contract.", icon: Bot, category: "AI", tone: "info" },
  "ai.contract_risk_analysis": { title: "AI risk analysis", description: "AI analyzed contract risks.", icon: Bot, category: "AI", tone: "info" },
  "ai.milestone_plan_generated": { title: "AI milestone plan generated", description: "AI generated a milestone plan.", icon: Bot, category: "AI", tone: "info" },
  "ai.task_builder": { title: "AI task created", description: "AI helped draft a task.", icon: Bot, category: "AI", tone: "info" },
  "ai.project_builder": { title: "AI project created", description: "AI helped draft a project.", icon: Bot, category: "AI", tone: "info" },
  "ai.dispute_summary_generated": { title: "AI dispute summary generated", description: "AI generated a dispute summary.", icon: Bot, category: "AI", tone: "info" },
  "admin.user_suspended": { title: "User suspended", description: "A user was suspended.", icon: ShieldCheck, category: "Security", tone: "destructive" },
  "admin.user_activated": { title: "User activated", description: "A user was reactivated.", icon: ShieldCheck, category: "Security", tone: "success" },
  "admin.user_promoted": { title: "User promoted to admin", description: "A user was promoted to admin.", icon: UserCog, category: "Security", tone: "warning" },
  "admin.user_demoted": { title: "Admin demoted", description: "An admin was demoted.", icon: UserCog, category: "Security", tone: "warning" },
  "admin.user_deleted": { title: "User deleted", description: "A user was deleted.", icon: Trash2, category: "Security", tone: "destructive" },
  "admin.payment_settings_updated": { title: "Payment settings updated", description: "Payment gateway settings were updated.", icon: Settings, category: "System", tone: "info" },
  "privacy.account_deleted": { title: "Account deleted", description: "An account was permanently deleted.", icon: Trash2, category: "Account", tone: "destructive" },
  "privacy.export_generated": { title: "Data export generated", description: "A personal data export was generated.", icon: Eye, category: "Account", tone: "info" },
};

const DYNAMIC_PATTERNS: Array<{ pattern: RegExp; info: (m: RegExpMatchArray) => AuditActionInfo }> = [
  { pattern: /^auth\.reauth_success_(.+)$/, info: (m) => ({ title: "Re-authenticated", description: `Identity re-verified using ${m[1].replace(/_/g, " ")}.`, icon: ShieldCheck, category: "Security", tone: "success" }) },
  { pattern: /^ai\.(.+)$/, info: (m) => {
      const names: Record<string,string> = { team_planner:"Team Planner", task_planner:"Task Planner", contract:"Contract Assistant", funding:"Funding Assistant", risk:"Risk Assistant", evidence:"Evidence Assistant", progress:"Progress Assistant", project_brief_helper:"Project Brief Helper", milestone_helper:"Milestone Helper", dispute_helper:"Dispute Helper" };
      const name = names[m[1]] ?? m[1].replace(/_/g, " ");
      return { title: `AI assistant used: ${name}`, description: `The ${name} provided advisory information.`, icon: Bot, category: "AI", tone: "info" };
    }
  },
  { pattern: /^payment\.webhook\.(.+)$/, info: (m) => ({ title: `Payment ${m[1]}`, description: `Payment status updated to ${m[1]}.`, icon: CreditCard, category: "Financial", tone: m[1]==="succeeded"?"success":m[1]==="failed"?"destructive":"info" }) },
  { pattern: /^funding\.(.+)$/, info: (m) => ({ title: `Funding ${m[1]}`, description: `Funding status: ${m[1]}.`, icon: Wallet, category: "Financial", tone: m[1]==="success"?"success":m[1]==="failed"?"destructive":"info" }) },
  { pattern: /^kyc\.(.+)$/, info: (m) => ({ title: `Identity verification: ${m[1].replace(/_/g," ")}`, description: `KYC status: ${m[1].replace(/_/g," ")}.`, icon: ShieldCheck, category: "Security", tone: m[1].includes("verified")?"success":m[1].includes("reject")?"destructive":"info" }) },
  { pattern: /^milestone\.(.+)$/, info: (m) => ({ title: `Milestone ${m[1].replace(/_/g," ")}`, description: `Milestone status: ${m[1].replace(/_/g," ")}.`, icon: Target, category: "Projects", tone: "info" }) },
];

export function translateAuditAction(action: string): AuditActionInfo {
  if (ACTION_MAP[action]) return ACTION_MAP[action];
  for (const { pattern, info } of DYNAMIC_PATTERNS) {
    const match = action.match(pattern);
    if (match) return info(match);
  }
  return { title: "Activity recorded", description: "An activity was recorded on your account.", icon: Activity, category: "System", tone: "info" };
}

export function translateMetadata(metadata: string | Record<string, unknown> | null | undefined): Array<{ label: string; value: string }> {
  let meta: Record<string, unknown> = {};
  if (typeof metadata === "string") { try { meta = JSON.parse(metadata || "{}"); } catch { return []; } }
  else if (metadata && typeof metadata === "object") { meta = metadata; }

  const SENSITIVE = new Set(["password","token","secret","hash","signature","authorization","csrf","session","refresh","apikey","privatekey","clientsecret","webhooksecret","key"]);
  const LABELS: Record<string, string> = {
    provider:"Provider", role:"Role", email:"Email", from:"Previous", to:"New", before:"Before", after:"After",
    reason:"Reason", targetEmail:"Affected email", status:"Status", amountMinor:"Amount (minor)", currency:"Currency",
    version:"Version", decision:"Decision", messageCount:"Messages", tokensUsed:"Tokens used",
    fallbackUsed:"Fallback used", latencyMs:"Latency (ms)", responseKind:"Response type",
    ageMinutes:"Age (min)", model:"AI model", assistant:"Assistant", feeRateBps:"Fee rate", livePaymentsEnabled:"Live payments",
  };

  const result: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE.has(key.toLowerCase())) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && Object.keys(value as object).length === 0) continue;
    const label = LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    let displayValue: string;
    if (typeof value === "boolean") displayValue = value ? "Yes" : "No";
    else if (typeof value === "object") { displayValue = JSON.stringify(value); if (displayValue.length > 200) continue; }
    else displayValue = String(value);
    result.push({ label, value: displayValue });
  }
  return result;
}
