"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, timeAgo, formatMinor } from "@/lib/client-api";
import { FolderKanban, Plus, ArrowRight, Wallet, ShieldCheck, Building2, Bell, Scale, CheckCircle2, LayoutDashboard } from "lucide-react";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";

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

export function DashboardView() {
  const { navigate } = useNav();
  const [data, setData] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>("/api/projects?limit=5"),
      api.get<Stats>("/api/dashboard").catch(() => null),
    ]).then(([d, s]) => {
      setData(d);
      setStats(s);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
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

      {/* Account setup alerts */}
      {stats && !stats.kycVerified && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
            <strong>KYC verification required.</strong> Complete identity verification (NIN + selfie) to fund milestones and receive payouts.
            <Button size="sm" variant="outline" className="ml-3" onClick={() => navigate({ view: "kyc" })}>
              Verify now
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {stats && !stats.bankAccountAdded && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <Building2 className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
            <strong>Add a bank account.</strong> You need a bank account to receive payouts.
            <Button size="sm" variant="outline" className="ml-3" onClick={() => navigate({ view: "settings-payouts" })}>
              Add bank account
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active projects"
          value={stats?.activeProjects ?? 0}
          sub={stats ? `${stats.completedProjects} completed` : undefined}
          icon={FolderKanban}
        />
        <StatCard
          label="Pending milestones"
          value={stats?.pendingMilestones ?? 0}
          icon={CheckCircle2}
        />
        <StatCard
          label="Total earnings"
          value={stats ? formatMinor(stats.totalEarningsMinor, "NGN") : "₦0"}
          isText
          icon={Wallet}
        />
        <StatCard
          label="Pending payouts"
          value={stats?.pendingPayouts ?? 0}
          icon={Wallet}
          accent={stats && stats.pendingPayouts > 0 ? "warning" : "default"}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Open disputes"
          value={stats?.openDisputes ?? 0}
          icon={Scale}
          accent={stats && stats.openDisputes > 0 ? "destructive" : "default"}
          onClick={() => navigate({ view: "projects" })}
        />
        <StatCard
          label="Unread notifications"
          value={stats?.unreadNotifications ?? 0}
          icon={Bell}
          onClick={() => navigate({ view: "notifications" })}
        />
        <StatCard
          label="Account status"
          value={stats?.kycVerified ? "Verified" : "Pending KYC"}
          isText
          icon={ShieldCheck}
          accent={stats?.kycVerified ? "success" : "warning"}
          onClick={() => navigate({ view: "kyc" })}
        />
      </div>

      {/* Recent projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent projects</CardTitle>
            <CardDescription>Your most recently updated projects.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ view: "projects" })}>
            View all <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading projects…" />
          ) : data?.projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to start collaborating."
              action={
                <Button onClick={() => navigate({ view: "projects" })}>
                  <Plus className="mr-2 h-4 w-4" /> Create project
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {data?.projects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate({ view: "project-detail", projectId: p.id })}
                    className="w-full text-left py-3 flex items-center gap-4 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{p.title}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">{p.status}</Badge>
                        <Badge variant="secondary" className="text-xs">{p.myRole}</Badge>
                        <span>{p._count.tasks} tasks · {p._count.milestones} milestones</span>
                        <span>· Updated {timeAgo(p.updatedAt)}</span>
                      </div>
                    </div>
                    {p.budgetMinor > 0 && (
                      <div className="text-right text-sm hidden sm:block">
                        <div className="font-medium">{formatMinor(p.budgetMinor, p.currency)}</div>
                        <div className="text-xs text-muted-foreground">budget</div>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  isText,
  accent = "default",
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  isText?: boolean;
  accent?: "default" | "warning" | "destructive" | "success";
  onClick?: () => void;
}) {
  const accentClasses = {
    default: "text-primary bg-primary/10",
    warning: "text-amber-600 bg-amber-500/10",
    destructive: "text-destructive bg-destructive/10",
    success: "text-emerald-600 bg-emerald-500/10",
  };
  return (
    <Card className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} >
      <CardContent className="p-4" onClick={onClick}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${accentClasses[accent]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyProjects({ onNew }: { onNew: () => void }) {
  // Kept for backwards compatibility — the inline EmptyState is now used instead.
  return (
    <EmptyState
      icon={FolderKanban}
      title="No projects yet"
      description="Create your first project to start collaborating."
      action={
        <Button onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" /> Create project
        </Button>
      }
    />
  );
}
