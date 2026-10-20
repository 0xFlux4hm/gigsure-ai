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
  Loader2,
} from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Project not found or you don&apos;t have access.
        </CardContent>
      </Card>
    );
  }

  const sections = [
    { label: "Contracts", icon: FileText, view: "project-contracts" as const, count: project._count.contracts, desc: project.recentContracts[0]?.status ?? "No contracts yet" },
    { label: "Team", icon: Users, view: "project-team" as const, count: project._count.memberships, desc: `${project._count.memberships} member${project._count.memberships === 1 ? "" : "s"}` },
    { label: "Tasks", icon: CheckSquare, view: "project-tasks" as const, count: project._count.tasks, desc: `${project._count.tasks} tasks tracked` },
    { label: "Compensation", icon: Wallet, view: "project-compensation" as const, count: project.latestCompensation ? 1 : 0, desc: project.latestCompensation ? `v${project.latestCompensation.versionNumber} · ${project.latestCompensation.status}` : "No agreements yet" },
    { label: "Milestones", icon: CheckSquare, view: "project-milestones" as const, count: project._count.milestones, desc: `${project._count.milestones} milestones` },
    { label: "Funding", icon: Wallet, view: "project-funding" as const, count: 0, desc: project.fundingArrangement },
    { label: "Disputes", icon: Scale, view: "project-disputes" as const, count: project._count.disputes, desc: project._count.disputes > 0 ? `${project._count.disputes} open` : "None open" },
    { label: "AI assistants", icon: Bot, view: "project-ai" as const, count: 0, desc: "7 advisory assistants" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold">{project.title}</h1>
          <Badge variant="outline">{project.status}</Badge>
          <Badge variant="secondary">{project.myRole}</Badge>
        </div>
        <p className="text-muted-foreground whitespace-pre-wrap">{project.description}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Budget" value={project.budgetMinor > 0 ? formatMinor(project.budgetMinor, project.currency) : "—"} />
        <StatCard label="Currency" value={project.currency} />
        <StatCard label="Start date" value={formatDate(project.startDate)} />
        <StatCard label="Due date" value={formatDate(project.dueDate)} />
      </div>

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

      <Card>
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
                ? `v${project.recentContracts[0].versionNumber} · ${project.recentContracts[0].status}`
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
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
