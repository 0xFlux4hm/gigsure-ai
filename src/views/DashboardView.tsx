"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api, timeAgo, formatMinor } from "@/lib/client-api";
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Wallet,
  LayoutDashboard,
  Clock,
  Users,
} from "lucide-react";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  StatCard,
  formatStatus,
} from "@/components/shared/page-components";
import {
  AccountSetupCard,
  buildStandardSetupSteps,
} from "@/components/shared/AccountSetupCard";

type DashboardData = {
  projects: Array<{
    id: string;
    title: string;
    status: string;
    currency: string;
    budgetMinor: number;
    updatedAt: string;
    myRole: string;
    _count: { tasks: number; milestones: number; disputes: number };
  }>;
};

type Stats = {
  activeProjects: number;
  completedProjects: number;
  pendingMilestones: number;
  pendingPayouts: number;
  totalEarningsMinor: number;
  unreadNotifications: number;
  openDisputes: number;
  kycVerified: boolean;
  bankAccountAdded: boolean;
};

/** Rough progress estimate based on project status (no task-completion data available). */
function projectProgress(p: DashboardData["projects"][number]): number {
  const s = p.status.toLowerCase();
  if (s.includes("complet") || s.includes("done") || s.includes("closed")) return 100;
  if (s.includes("active") || s.includes("progress") || s.includes("ongoing")) return 65;
  if (s.includes("pause") || s.includes("hold")) return 40;
  if (s.includes("draft")) return 12;
  return 50;
}

/** Map a status string to one of the premium badge classes from globals.css. */
function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("done") || s.includes("closed") || s.includes("success"))
    return "badge-success";
  if (
    s.includes("pend") ||
    s.includes("review") ||
    s.includes("wait") ||
    s.includes("hold") ||
    s.includes("draft")
  )
    return "badge-warning";
  if (s.includes("disput") || s.includes("cancel") || s.includes("fail"))
    return "badge-danger";
  return "badge-info";
}

export function DashboardView() {
  const { navigate } = useNav();
  const [data, setData] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/api/projects?limit=5"),
      api.get<Stats>("/api/dashboard").catch(() => null),
    ])
      .then(([d, s]) => {
        setData(d);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        description="Welcome back. Here's what's happening across your projects."
        icon={LayoutDashboard}
        actions={
          <Button onClick={() => navigate({ view: "projects" })}>
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        }
      />

      {/* Stat cards — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="premium-stat">
          <StatCard
            label="Active projects"
            value={String(stats?.activeProjects ?? 0)}
            icon={FolderKanban}
            accent="default"
            onClick={() => navigate({ view: "projects" })}
          />
        </div>
        <div className="premium-stat">
          <StatCard
            label="Completed projects"
            value={String(stats?.completedProjects ?? 0)}
            icon={FolderKanban}
            accent="success"
            onClick={() => navigate({ view: "projects" })}
          />
        </div>
        <div className="premium-stat">
          <StatCard
            label="Pending milestones"
            value={String(stats?.pendingMilestones ?? 0)}
            icon={Clock}
            accent="warning"
            onClick={() => navigate({ view: "projects" })}
          />
        </div>
        <div className="premium-stat">
          <StatCard
            label="Total earnings"
            value={stats ? formatMinor(stats.totalEarningsMinor, "NGN") : "₦0"}
            icon={Wallet}
            accent="success"
            onClick={() => navigate({ view: "settings-payouts" })}
          />
        </div>
      </div>

      {/* Account setup checklist — unified KYC + bank account card.
          Auto-hides once both steps are complete. */}
      {stats && (!stats.kycVerified || !stats.bankAccountAdded) && (
        <AccountSetupCard
          steps={buildStandardSetupSteps({
            kycVerified: stats.kycVerified,
            bankAccountAdded: stats.bankAccountAdded,
            onKycClick: () => navigate({ view: "kyc" }),
            onBankAccountClick: () => navigate({ view: "settings-payouts" }),
          })}
        />
      )}

      {/* Recent projects */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Recent projects</h2>
            <p className="text-sm text-muted-foreground">Your most recently updated projects.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => navigate({ view: "projects" })}
          >
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>

        {loading ? (
          <Card className="premium-card">
            <CardContent className="p-6">
              <LoadingState label="Loading projects…" />
            </CardContent>
          </Card>
        ) : data?.projects.length === 0 ? (
          <Card className="premium-card">
            <CardContent className="p-6">
              <EmptyState
                icon={FolderKanban}
                title="No projects yet"
                description="Create your first project to start collaborating with your team."
                action={
                  <Button onClick={() => navigate({ view: "projects" })}>
                    <Plus className="mr-2 h-4 w-4" /> Create project
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.projects.map((p) => {
              const progress = projectProgress(p);
              const memberCount = p._count.tasks + p._count.milestones + p._count.disputes;
              return (
                <Card
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open project ${p.title}`}
                  className="premium-card group cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => navigate({ view: "project-detail", projectId: p.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate({ view: "project-detail", projectId: p.id });
                    }
                  }}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Header: title + status badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                          <FolderKanban className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate leading-tight">{p.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            Updated {timeAgo(p.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 capitalize ${statusBadgeClass(p.status)}`}
                      >
                        {formatStatus(p.status)}
                      </Badge>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium tabular-nums">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    {/* Footer: member count + budget */}
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          <span className="tabular-nums">{memberCount} members</span>
                        </span>
                        <span className="text-border select-none">·</span>
                        <span className="hidden sm:inline tabular-nums">
                          {p._count.tasks} tasks
                        </span>
                      </div>
                      {p.budgetMinor > 0 ? (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            {formatMinor(p.budgetMinor, p.currency)}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            budget
                          </div>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {p.myRole}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
