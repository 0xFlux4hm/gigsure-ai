"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, formatDate, formatMinor, timeAgo } from "@/lib/client-api";
import {
  FileText,
  Users,
  CheckSquare,
  Wallet,
  Scale,
  Bot,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";

type ProjectDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  currency: string;
  budgetMinor: number;
  fundingArrangement: string;
  startDate: string | null;
  dueDate: string | null;
  myRole: string;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; displayName: string; email: string };
  client: { id: string; displayName: string; email: string } | null;
  recentContracts: Array<{ id: string; versionNumber: number; status: string; createdAt: string }>;
  latestCompensation: { id: string; versionNumber: number; status: string } | null;
  _count: { tasks: number; milestones: number; contracts: number; disputes: number; memberships: number };
};

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { navigate } = useNav();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [milestones, setMilestones] = useState<Array<{ status: string; amountMinor: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ProjectDetail>(`/api/projects/${projectId}`),
      api.get<{ milestones: Array<{ status: string; amountMinor: number }> }>(`/api/projects/${projectId}/milestones`).catch(() => ({ milestones: [] })),
    ]).then(([p, m]) => {
      setProject(p);
      setMilestones(m.milestones ?? []);
    }).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <LoadingState label="Loading project…" />;
  }

  if (!project) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Project not found"
        description="Project not found or you don't have access."
      />
    );
  }

  const sections = [
    { label: "Contracts", icon: FileText, view: "project-contracts" as const, count: project._count.contracts, desc: project.recentContracts[0]?.status ? formatStatus(project.recentContracts[0].status) : "No contracts yet" },
    { label: "Team", icon: Users, view: "project-team" as const, count: project._count.memberships, desc: `${project._count.memberships} member${project._count.memberships === 1 ? "" : "s"}` },
    { label: "Tasks", icon: CheckSquare, view: "project-tasks" as const, count: project._count.tasks, desc: `${project._count.tasks} tasks tracked` },
    { label: "Compensation", icon: Wallet, view: "project-compensation" as const, count: project.latestCompensation ? 1 : 0, desc: project.latestCompensation ? `v${project.latestCompensation.versionNumber} · ${formatStatus(project.latestCompensation.status)}` : "No agreements yet" },
    { label: "Milestones", icon: CheckSquare, view: "project-milestones" as const, count: project._count.milestones, desc: `${project._count.milestones} milestones` },
    { label: "Funding", icon: Wallet, view: "project-funding" as const, count: 0, desc: project.fundingArrangement },
    { label: "Disputes", icon: Scale, view: "project-disputes" as const, count: project._count.disputes, desc: project._count.disputes > 0 ? `${project._count.disputes} open` : "None open" },
    { label: "AI assistants", icon: Bot, view: "project-ai" as const, count: 0, desc: "7 advisory assistants" },
  ];

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title={project.title}
        description={project.description}
        icon={FolderKanban}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="badge-info" variant="outline">{formatStatus(project.status)}</Badge>
            <Badge className="badge-warning" variant="secondary">{project.myRole}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Budget" value={project.budgetMinor > 0 ? formatMinor(project.budgetMinor, project.currency) : "—"} />
        <StatCard label="Currency" value={project.currency} />
        <StatCard label="Start date" value={formatDate(project.startDate)} />
        <StatCard label="Due date" value={formatDate(project.dueDate)} />
      </div>

      {/* Progress bars */}
      {milestones.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProgressCard
            label="Milestone progress"
            value={milestones.filter((m) => m.status === "RELEASED").length}
            total={milestones.length}
            color="bg-primary"
            subLabel={`${milestones.filter((m) => m.status === "RELEASED").length} of ${milestones.length} released`}
          />
          <ProgressCard
            label="Funding deployed"
            value={milestones.filter((m) => ["FUNDED", "SUBMITTED", "APPROVED", "RELEASE_INITIATED", "RELEASED"].includes(m.status)).reduce((s, m) => s + m.amountMinor, 0)}
            total={milestones.reduce((s, m) => s + m.amountMinor, 0)}
            color="bg-emerald-500"
            subLabel={`${formatMinor(milestones.filter((m) => ["FUNDED", "SUBMITTED", "APPROVED", "RELEASE_INITIATED", "RELEASED"].includes(m.status)).reduce((s, m) => s + m.amountMinor, 0), project.currency)} of ${formatMinor(milestones.reduce((s, m) => s + m.amountMinor, 0), project.currency)}`}
            isMoney
          />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Project sections</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sections.map((s) => (
            <button
              key={s.view}
              onClick={() => navigate({ view: s.view, projectId })}
              className="text-left p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-3"
            >
              <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground truncate">{s.desc}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-base">Project metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Owner</div>
            <div className="font-medium">{project.owner.displayName}</div>
            <div className="text-xs text-muted-foreground">{project.owner.email}</div>
          </div>
          {project.client && (
            <div>
              <div className="text-xs text-muted-foreground">Client</div>
              <div className="font-medium">{project.client.displayName}</div>
              <div className="text-xs text-muted-foreground">{project.client.email}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">Funding</div>
            <div className="font-medium">{project.fundingArrangement}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Created</div>
            <div className="font-medium">{formatDate(project.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last updated</div>
            <div className="font-medium">{timeAgo(project.updatedAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Latest contract</div>
            <div className="font-medium">
              {project.recentContracts[0]
                ? `v${project.recentContracts[0].versionNumber} · ${formatStatus(project.recentContracts[0].status)}`
                : "None yet"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="premium-card">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}

function ProgressCard({
  label,
  value,
  total,
  color,
  subLabel,
  isMoney,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  subLabel: string;
  isMoney?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <Card className="premium-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs font-medium">{pct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-muted-foreground mt-2">{subLabel}</div>
      </CardContent>
    </Card>
  );
}
