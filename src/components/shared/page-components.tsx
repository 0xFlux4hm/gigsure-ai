"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-6", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 mt-2 sm:mt-0">{actions}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
      <div className="h-8 w-2/3 bg-muted rounded animate-pulse" />
      <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-1/4 bg-muted rounded animate-pulse" />
            <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, accent = "default", onClick }: StatCardProps) {
  const accentClasses = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-amber-500/10 text-amber-600",
    danger: "bg-red-500/10 text-red-600",
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all hover:shadow-sm",
        onClick && "cursor-pointer hover:border-primary/30"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {Icon && (
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", accentClasses[accent])}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  // Funding
  INITIATED: "Initiated",
  PROVIDER_CONFIRMED: "Confirmed",
  PARTIALLY_CONFIRMED: "Partially Confirmed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
  DRAFT: "Draft",

  // Payment transactions
  CREATED: "Created",
  PENDING: "Pending",
  REQUIRES_ACTION: "Action Required",
  SUCCEEDED: "Completed",
  EXPIRED: "Expired",
  CANCELED: "Cancelled",
  REFUND_PENDING: "Refund Pending",
  PARTIALLY_REFUNDED: "Partially Refunded",
  REFUNDED: "Refunded",
  REVERSED: "Reversed",
  RECONCILIATION_REQUIRED: "Reconciliation Required",

  // Milestones
  AWAITING_FUNDING: "Awaiting Funding",
  FUNDED: "Funded",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  RELEASED: "Released",
  REJECTED: "Rejected",

  // Projects
  ACTIVE: "Active",
  COMPLETED: "Completed",
  PAUSED: "Paused",

  // Contracts
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  SUPERSEDED: "Superseded",

  // Disputes
  OPEN: "Open",
  UNDER_REVIEW: "Under Review",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",

  // Tasks
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  REVIEW: "In Review",
  DONE: "Done",

  // Expenses
  REQUESTED: "Requested",
  RELEASED_EXPENSE: "Released",

  // KYC
  VERIFIED: "Verified",
  IN_PROGRESS_KYC: "In Progress",

  // Account
  PENDING_REGISTRATION: "Pending Registration",
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
