"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { api, formatDateTime, timeAgo, formatMinor } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck,
  Users,
  FolderKanban,
  Wallet,
  CreditCard,
  Scale,
  ScrollText,
  Bot,
  Lock,
  Webhook,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Search,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";

type AdminTab = "overview" | "users" | "projects" | "payments" | "disputes" | "kyc" | "audit" | "ai" | "privacy" | "webhooks";

export function AdminView() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ platformRole: string }>("/api/admin/me")
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold mb-2">Administrator access required</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This page is restricted to platform administrators. If you believe you should have access,
            contact your platform administrator or set <code className="bg-muted px-1.5 py-0.5 rounded text-xs">ADMIN_EMAILS</code> in the environment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Admin Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Platform-wide oversight. All actions are audited.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background"><TrendingUp className="h-3.5 w-3.5 mr-1" /> Overview</TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-background"><Users className="h-3.5 w-3.5 mr-1" /> Users</TabsTrigger>
          <TabsTrigger value="projects" className="data-[state=active]:bg-background"><FolderKanban className="h-3.5 w-3.5 mr-1" /> Projects</TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-background"><CreditCard className="h-3.5 w-3.5 mr-1" /> Payments</TabsTrigger>
          <TabsTrigger value="disputes" className="data-[state=active]:bg-background"><Scale className="h-3.5 w-3.5 mr-1" /> Disputes</TabsTrigger>
          <TabsTrigger value="kyc" className="data-[state=active]:bg-background"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> KYC</TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-background"><ScrollText className="h-3.5 w-3.5 mr-1" /> Audit</TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:bg-background"><Bot className="h-3.5 w-3.5 mr-1" /> AI</TabsTrigger>
          <TabsTrigger value="privacy" className="data-[state=active]:bg-background"><Lock className="h-3.5 w-3.5 mr-1" /> Privacy</TabsTrigger>
          <TabsTrigger value="webhooks" className="data-[state=active]:bg-background"><Webhook className="h-3.5 w-3.5 mr-1" /> Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsTab /></TabsContent>
        <TabsContent value="payments" className="mt-4"><PaymentsTab /></TabsContent>
        <TabsContent value="disputes" className="mt-4"><DisputesTab /></TabsContent>
        <TabsContent value="kyc" className="mt-4"><KycTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AiTab /></TabsContent>
        <TabsContent value="privacy" className="mt-4"><PrivacyTab /></TabsContent>
        <TabsContent value="webhooks" className="mt-4"><WebhooksTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

type Stats = {
  generatedAt: string;
  generatedBy: string;
  counts: {
    users: { total: number; active: number; suspended: number; pendingDeletion: number };
    projects: { total: number; active: number; cancelled: number };
    contracts: { total: number; accepted: number };
    milestones: number;
    funding: {
      total: number;
      pending: number;
      confirmed: number;
      failed: number;
      confirmedVolumeMinor: number;
      releaseVolumeMinor: number;
    };
    disputes: { total: number; open: number; resolved: number };
    invitations: { total: number; pending: number };
    tasks: { total: number; open: number };
    ai: { totalActivities: number };
    privacy: { pendingRequests: number };
    webhooks: { total: number; invalidSignatures: number };
    auditEvents: number;
  };
  trends: {
    last7Days: { newUsers: number; newFunding: number; newDisputes: number; aiCalls: number };
  };
  recentAuditEvents: Array<{
    id: string;
    action: string;
    targetType: string | null;
    createdAt: string;
    actor: { id: string; displayName: string; email: string } | null;
  }>;
};

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.get<Stats>("/api/admin/stats").then(setStats).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <LoadingState />;
  if (error || !stats) return <ErrorState message={error ?? "Failed to load"} onRetry={load} />;

  const c = stats.counts;
  const t = stats.trends.last7Days;

  return (
    <div className="space-y-6">
      {/* Top stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total users" value={c.users.total} sub={`${c.users.active} active · ${c.users.suspended} suspended`} icon={Users} accent="primary" />
        <StatCard label="Total projects" value={c.projects.total} sub={`${c.projects.active} active`} icon={FolderKanban} />
        <StatCard label="Open disputes" value={c.disputes.open} sub={`${c.disputes.total} total · ${c.disputes.resolved} resolved`} icon={Scale} accent={c.disputes.open > 0 ? "destructive" : "default"} />
        <StatCard label="Pending funding" value={c.funding.pending} sub={`${c.funding.confirmed} confirmed · ${c.funding.failed} failed`} icon={Wallet} />
      </div>

      {/* 7-day trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Last 7 days</CardTitle>
          <CardDescription>Platform activity over the past week</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TrendCard label="New users" value={t.newUsers} />
          <TrendCard label="New funding records" value={t.newFunding} />
          <TrendCard label="New disputes" value={t.newDisputes} />
          <TrendCard label="AI calls" value={t.aiCalls} />
        </CardContent>
      </Card>

      {/* Financial overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial overview</CardTitle>
          <CardDescription>Transaction history and payment records</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Confirmed funding volume</div>
            <div className="text-lg font-semibold mt-1">{formatMinor(c.funding.confirmedVolumeMinor, "NGN")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Released volume</div>
            <div className="text-lg font-semibold mt-1">{formatMinor(c.funding.releaseVolumeMinor, "NGN")}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Failed transactions</div>
            <div className="text-lg font-semibold mt-1 text-destructive">{c.funding.failed}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Invalid webhook signatures</div>
            <div className="text-lg font-semibold mt-1 text-destructive">{c.webhooks.invalidSignatures}</div>
          </div>
        </CardContent>
      </Card>

      {/* System counts */}
      <div className="grid md:grid-cols-3 gap-4">
        <MiniStat label="Contracts" value={`${c.contracts.accepted}/${c.contracts.total} accepted`} />
        <MiniStat label="Milestones" value={String(c.milestones)} />
        <MiniStat label="Tasks (open)" value={`${c.tasks.open} / ${c.tasks.total}`} />
        <MiniStat label="Pending invitations" value={String(c.invitations.pending)} />
        <MiniStat label="AI activities" value={String(c.ai.totalActivities)} />
        <MiniStat label="Pending privacy requests" value={String(c.privacy.pendingRequests)} accent={c.privacy.pendingRequests > 0 ? "warning" : "default"} />
      </div>

    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent = "default" }: {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "primary" | "destructive";
}) {
  const accentClasses = {
    default: "bg-muted/30",
    primary: "bg-primary/10 text-primary",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
          <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${accentClasses[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendCard({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, accent = "default" }: { label: string; value: string; accent?: "default" | "warning" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-semibold mt-0.5 ${accent === "warning" ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  accountStatus: string;
  platformRole: string;
  lastLoginAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  _count: { projectsOwned: number; memberships: number; auditEvents: number; aiActivities: number };
};

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    if (roleFilter) params.set("role", roleFilter);
    api.get<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params.toString()}`)
      .then((r) => { setUsers(r.users); setTotal(r.total); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, statusFilter, roleFilter]);

  const act = async (userId: string, action: "suspend" | "activate" | "promote_admin" | "demote_admin") => {
    if (!confirm(`Are you sure you want to ${action.replace("_", " ")} this user?`)) return;
    setActingId(userId);
    try {
      const reason = action === "suspend" ? prompt("Reason for suspension (optional):") ?? "" : "";
      await api.patch(`/api/admin/users/${userId}`, { action, reason: reason || undefined });
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="PENDING_DELETION">Pending deletion</SelectItem>
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={roleFilter || "ALL"} onValueChange={(v) => setRoleFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Users ({total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Role</th>
                    <th className="text-right p-2">Projects</th>
                    <th className="text-right p-2">AI calls</th>
                    <th className="text-left p-2">Last login</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No users found.</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <div className="font-medium">{u.displayName}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="p-2">
                        <Badge variant={
                          u.accountStatus === "ACTIVE" ? "default" :
                          u.accountStatus === "SUSPENDED" ? "destructive" :
                          u.accountStatus === "DELETED" ? "secondary" :
                          "outline"
                        } className="text-xs">{u.accountStatus}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant={u.platformRole === "ADMIN" ? "default" : "outline"} className="text-xs">{u.platformRole}</Badge>
                      </td>
                      <td className="p-2 text-right">{u._count.projectsOwned}</td>
                      <td className="p-2 text-right">{u._count.aiActivities}</td>
                      <td className="p-2 text-xs text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}</td>
                      <td className="p-2 text-right">
                        {actingId === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        ) : (
                          <div className="flex justify-end gap-1">
                            {u.accountStatus === "ACTIVE" ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(u.id, "suspend")}>Suspend</Button>
                            ) : u.accountStatus === "SUSPENDED" ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(u.id, "activate")}>Activate</Button>
                            ) : null}
                            {u.platformRole === "USER" ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(u.id, "promote_admin")}>Promote</Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => act(u.id, "demote_admin")}>Demote</Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projects tab
// ---------------------------------------------------------------------------

type AdminProject = {
  id: string;
  title: string;
  slug: string;
  status: string;
  currency: string;
  budgetMinor: number;
  fundingArrangement: string;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; displayName: string; email: string };
  client: { id: string; displayName: string; email: string } | null;
  _count: { tasks: number; milestones: number; contracts: number; disputes: number; memberships: number; fundingRecords: number };
};

function ProjectsTab() {
  const { navigate } = useNav();
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    api.get<{ projects: AdminProject[]; total: number }>(`/api/admin/projects?${params.toString()}`)
      .then((r) => { setProjects(r.projects); setTotal(r.total); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Status filter</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Projects ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Project</th>
                    <th className="text-left p-2">Owner</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Budget</th>
                    <th className="text-right p-2">Tasks</th>
                    <th className="text-right p-2">Milestones</th>
                    <th className="text-right p-2">Disputes</th>
                    <th className="text-left p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate({ view: "project-detail", projectId: p.id })}
                    >
                      <td className="p-2">
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">{p.slug}</div>
                      </td>
                      <td className="p-2 text-xs">
                        <div>{p.owner.displayName}</div>
                        <div className="text-muted-foreground">{p.owner.email}</div>
                      </td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                      <td className="p-2 text-right">{p.budgetMinor > 0 ? formatMinor(p.budgetMinor, p.currency) : "—"}</td>
                      <td className="p-2 text-right">{p._count.tasks}</td>
                      <td className="p-2 text-right">{p._count.milestones}</td>
                      <td className="p-2 text-right">
                        {p._count.disputes > 0 ? (
                          <span className="text-destructive font-medium">{p._count.disputes}</span>
                        ) : "0"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{timeAgo(p.createdAt)}</td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No projects found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funding tab
// ---------------------------------------------------------------------------

type FundingRecord = {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  providerTxRef: string | null;
  isSimulated: boolean;
  initiatedAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
  project: { id: string; title: string; slug: string };
  milestone: { id: string; title: string } | null;
  initiatedBy: { id: string; displayName: string; email: string };
  webhookEvents: Array<{ id: string; eventType: string; signatureValid: boolean; processedAt: string | null; createdAt: string }>;
};

function FundingTab() {
  const [records, setRecords] = useState<FundingRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [aggregates, setAggregates] = useState<{
    byStatus: Array<{ status: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
    volumeByStatus: Array<{ status: string; totalAmountMinor: number }>;
  } | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    api.get<{ records: FundingRecord[]; total: number; aggregates: typeof aggregates }>(`/api/admin/funding?${params.toString()}`)
      .then((r) => { setRecords(r.records); setTotal(r.total); setAggregates(r.aggregates); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      {/* Aggregate summary */}
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {aggregates.byStatus.map((s) => {
            const vol = aggregates.volumeByStatus.find((v) => v.status === s.status);
            return (
              <Card key={s.status}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{s.status}</div>
                  <div className="font-semibold mt-0.5">{s.count} records</div>
                  {vol && vol.totalAmountMinor > 0 && (
                    <div className="text-xs text-muted-foreground">{formatMinor(vol.totalAmountMinor, "NGN")}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="INITIATED">Initiated</SelectItem>
                <SelectItem value="PROVIDER_CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="DISPUTED">Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter || "ALL"} onValueChange={(v) => setTypeFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="FUNDING">Funding</SelectItem>
                <SelectItem value="RELEASE">Release</SelectItem>
                <SelectItem value="REFUND">Refund</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funding records ({total})</CardTitle>
          <CardDescription>Transaction history and payment records.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Type / Status</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-left p-2">Project</th>
                    <th className="text-left p-2">Initiated by</th>
                    <th className="text-left p-2">Provider</th>
                    <th className="text-left p-2">Webhooks</th>
                    <th className="text-left p-2">Initiated</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 align-top">
                      <td className="p-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">{r.type}</Badge>
                          <Badge variant={r.status === "PROVIDER_CONFIRMED" ? "default" : r.status === "FAILED" ? "destructive" : "secondary"} className="text-xs">{r.status}</Badge>
                          
                        </div>
                      </td>
                      <td className="p-2 text-right font-medium">{formatMinor(r.amountMinor, r.currency)}</td>
                      <td className="p-2 text-xs">
                        <div className="font-medium">{r.project.title}</div>
                        {r.milestone && <div className="text-muted-foreground">{r.milestone.title}</div>}
                      </td>
                      <td className="p-2 text-xs">
                        <div>{r.initiatedBy.displayName}</div>
                        <div className="text-muted-foreground">{r.initiatedBy.email}</div>
                      </td>
                      <td className="p-2 text-xs">
                        <div>{r.provider}</div>
                        {r.providerTxRef && <div className="text-muted-foreground font-mono">{r.providerTxRef.slice(0, 18)}…</div>}
                        {r.failureReason && <div className="text-destructive mt-1">{r.failureReason}</div>}
                      </td>
                      <td className="p-2 text-xs">
                        {r.webhookEvents.length === 0 ? (
                          <span className="text-muted-foreground">none</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {r.webhookEvents.map((w) => (
                              <li key={w.id} className="flex items-center gap-1">
                                {!w.signatureValid && <AlertTriangle className="h-3 w-3 text-destructive" />}
                                <span>{w.eventType}</span>
                                {w.processedAt && <CheckCircle2 className="h-3 w-3 text-primary" />}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{timeAgo(r.initiatedAt)}</td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No funding records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disputes tab
// ---------------------------------------------------------------------------

type AdminDispute = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  project: { id: string; title: string; slug: string };
  opener: { id: string; displayName: string; email: string };
  milestone: { id: string; title: string; status: string } | null;
  reviews: Array<{ id: string; outcome: string | null; reviewer: { id: string; displayName: string; email: string } }>;
  _count: { evidence: number; messages: number };
};

function DisputesTab() {
  const { navigate } = useNav();
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    api.get<{ disputes: AdminDispute[]; total: number }>(`/api/admin/disputes?${params.toString()}`)
      .then((r) => { setDisputes(r.disputes); setTotal(r.total); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Status filter</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="ESCALATED">Escalated</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Disputes ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <ul className="divide-y">
              {disputes.map((d) => (
                <li
                  key={d.id}
                  className="p-3 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate({ view: "project-dispute-detail", projectId: d.project.id, disputeId: d.id })}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{d.title}</h3>
                    <Badge variant="outline" className="text-xs">{d.category}</Badge>
                    <Badge variant={d.status === "OPEN" ? "destructive" : d.status === "RESOLVED" ? "default" : "secondary"} className="text-xs">{d.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{d.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                    <span>Project: {d.project.title}</span>
                    <span>· Opener: {d.opener.displayName}</span>
                    <span>· {d._count.evidence} evidence · {d._count.messages} messages</span>
                    {d.milestone && <span>· Milestone: {d.milestone.title} ({d.milestone.status})</span>}
                    <span>· {timeAgo(d.createdAt)}</span>
                  </div>
                  {d.reviews.length > 0 && (
                    <div className="text-xs mt-1">
                      Reviews: {d.reviews.map((r) => `${r.reviewer.displayName} (${r.outcome ?? "pending"})`).join(", ")}
                    </div>
                  )}
                </li>
              ))}
              {disputes.length === 0 && (
                <li className="p-6 text-center text-muted-foreground">No disputes found.</li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit tab
// ---------------------------------------------------------------------------

type AuditEvent = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; displayName: string; email: string } | null;
};

function AuditTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [topActions, setTopActions] = useState<Array<{ action: string; _count: { action: number } }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (actorFilter) params.set("actorId", actorFilter);
    api.get<{ events: AuditEvent[]; total: number; topActions: typeof topActions }>(`/api/admin/audit?${params.toString()}`)
      .then((r) => { setEvents(r.events); setTotal(r.total); setTopActions(r.topActions); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [actionFilter, actorFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Filter by action</Label>
            <Input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="e.g. auth, project, payment" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Filter by user ID</Label>
            <Input value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} placeholder="cmv…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Audit Log ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Action</th>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Target</th>
                    <th className="text-left p-2">IP</th>
                    <th className="text-left p-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No audit events.</td></tr>
                  )}
                  {events.map((e) => {
                    let meta: Record<string, unknown> = {};
                    try { meta = JSON.parse(e.metadata || "{}"); } catch {}
                    return (
                      <tr key={e.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">{e.action}</Badge>
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{e.actor?.displayName ?? "System"}</div>
                          <div className="text-xs text-muted-foreground">{e.actor?.email ?? "—"}</div>
                        </td>
                        <td className="p-2">
                          {e.targetType ? (
                            <Badge variant="secondary" className="text-xs">{e.targetType}</Badge>
                          ) : "—"}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground font-mono">{e.ipAddress ?? "—"}</td>
                        <td className="p-2 text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI tab
// ---------------------------------------------------------------------------

type AiActivity = {
  id: string;
  assistantType: string;
  prompt: string;
  response: string;
  tokensUsed: number;
  fallbackUsed: boolean;
  createdAt: string;
  user: { id: string; displayName: string; email: string };
  project: { id: string; title: string } | null;
};

function AiTab() {
  const [activities, setActivities] = useState<AiActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<{
    byAssistant: Array<{ assistant: string; count: number; tokensUsed: number }>;
    totalTokensUsed: number;
    fallbackCount: number;
    fallbackRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [assistantFilter, setAssistantFilter] = useState("");
  const [onlyFallback, setOnlyFallback] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (assistantFilter) params.set("assistant", assistantFilter);
    if (onlyFallback) params.set("fallback", "true");
    api.get<{ activities: AiActivity[]; total: number; aggregates: typeof aggregates }>(`/api/admin/ai-activity?${params.toString()}`)
      .then((r) => { setActivities(r.activities); setTotal(r.total); setAggregates(r.aggregates); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [assistantFilter, onlyFallback]);

  return (
    <div className="space-y-4">
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total calls</div><div className="font-semibold mt-0.5">{total}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total tokens used</div><div className="font-semibold mt-0.5">{aggregates.totalTokensUsed.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Fallback count</div><div className="font-semibold mt-0.5 text-amber-700 dark:text-amber-400">{aggregates.fallbackCount}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Fallback rate</div><div className="font-semibold mt-0.5">{(aggregates.fallbackRate * 100).toFixed(1)}%</div></CardContent></Card>
        </div>
      )}

      {aggregates && aggregates.byAssistant.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">By assistant</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {aggregates.byAssistant.map((a) => (
              <div key={a.assistant} className="flex items-center justify-between text-sm">
                <span>{a.assistant}</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{a.count} calls</span>
                  <span>{a.tokensUsed.toLocaleString()} tokens</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 flex gap-2 items-end flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Assistant</Label>
            <Select value={assistantFilter || "ALL"} onValueChange={(v) => setAssistantFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="TEAM_PLANNER">Team Planner</SelectItem>
                <SelectItem value="TASK_PLANNER">Task Planner</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
                <SelectItem value="FUNDING">Funding</SelectItem>
                <SelectItem value="RISK">Risk</SelectItem>
                <SelectItem value="EVIDENCE">Evidence</SelectItem>
                <SelectItem value="PROGRESS">Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyFallback} onChange={(e) => setOnlyFallback(e.target.checked)} />
            Only fallback responses
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent AI activity</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <ul className="divide-y max-h-[600px] overflow-y-auto">
              {activities.map((a) => (
                <li key={a.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="text-xs">{a.assistantType}</Badge>
                    {a.fallbackUsed && <Badge variant="outline" className="text-xs text-amber-700 border-amber-500">fallback</Badge>}
                    <span className="text-xs text-muted-foreground">{a.tokensUsed} tokens</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.user.displayName} · {a.project?.title ?? "no project"} · {timeAgo(a.createdAt)}
                  </div>
                  <details className="mt-1">
                    <summary className="text-xs cursor-pointer text-muted-foreground">View prompt + response</summary>
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Prompt:</div>
                        <pre className="text-xs bg-muted/50 rounded p-2 mt-1 whitespace-pre-wrap">{a.prompt}</pre>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Response:</div>
                        <pre className="text-xs bg-muted/50 rounded p-2 mt-1 whitespace-pre-wrap">{a.response}</pre>
                      </div>
                    </div>
                  </details>
                </li>
              ))}
              {activities.length === 0 && <li className="p-6 text-center text-muted-foreground">No AI activity yet.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy tab
// ---------------------------------------------------------------------------

type PrivacyRequest = {
  id: string;
  type: string;
  status: string;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; displayName: string; email: string; accountStatus: string };
};

function PrivacyTab() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    api.get<{ requests: PrivacyRequest[]; total: number }>(`/api/admin/privacy-requests?${params.toString()}`)
      .then((r) => { setRequests(r.requests); setTotal(r.total); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  const update = async (id: string, status: "PROCESSING" | "READY" | "COMPLETED" | "DENIED") => {
    setActingId(id);
    try {
      const result = status === "DENIED" ? prompt("Reason for denial (optional):") ?? "" : "";
      await api.patch("/api/admin/privacy-requests", { requestId: id, status, result: result || undefined });
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="DENIED">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Privacy requests ({total})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{r.type}</Badge>
                        <Badge variant={r.status === "PENDING" ? "destructive" : r.status === "COMPLETED" ? "default" : "secondary"} className="text-xs">{r.status}</Badge>
                      </div>
                      <div className="mt-1">
                        <span className="font-medium">{r.user.displayName}</span>
                        <span className="text-muted-foreground ml-1">({r.user.email})</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Requested {timeAgo(r.createdAt)} · Account: {r.user.accountStatus}
                        {r.completedAt && ` · Completed ${timeAgo(r.completedAt)}`}
                      </div>
                      {r.result && <div className="text-xs mt-1">Result: {r.result}</div>}
                    </div>
                    {r.status === "PENDING" && (
                      <div className="flex gap-1">
                        {actingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(r.id, "PROCESSING")}>Mark processing</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(r.id, "READY")}>Mark ready</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(r.id, "COMPLETED")}>Mark completed</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => update(r.id, "DENIED")}>Deny</Button>
                          </>
                        )}
                      </div>
                    )}
                    {r.status === "PROCESSING" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => update(r.id, "READY")}>Mark ready</Button>
                    )}
                  </div>
                </li>
              ))}
              {requests.length === 0 && <li className="p-6 text-center text-muted-foreground">No privacy requests.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks tab
// ---------------------------------------------------------------------------

type WebhookEvent = {
  id: string;
  provider: string;
  eventType: string;
  providerEventId: string | null;
  signatureValid: boolean;
  payload: string;
  processedAt: string | null;
  createdAt: string;
  fundingRecord: {
    id: string;
    providerTxRef: string;
    status: string;
    amountMinor: number;
    currency: string;
    project: { id: string; title: string };
  } | null;
};

function WebhooksTab() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<{
    invalidSignatureCount: number;
    unprocessedCount: number;
    byProvider: Array<{ provider: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterValid, setFilterValid] = useState("");
  const [unprocessedOnly, setUnprocessedOnly] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterValid === "true") params.set("signatureValid", "true");
    if (filterValid === "false") params.set("signatureValid", "false");
    if (unprocessedOnly) params.set("unprocessed", "true");
    api.get<{ events: WebhookEvent[]; total: number; aggregates: typeof aggregates }>(`/api/admin/webhooks?${params.toString()}`)
      .then((r) => { setEvents(r.events); setTotal(r.total); setAggregates(r.aggregates); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [filterValid, unprocessedOnly]);

  return (
    <div className="space-y-4">
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold mt-0.5">{total}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Invalid signatures</div><div className="font-semibold mt-0.5 text-destructive">{aggregates.invalidSignatureCount}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Unprocessed</div><div className="font-semibold mt-0.5 text-amber-700 dark:text-amber-400">{aggregates.unprocessedCount}</div></CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">By provider</div>
            <div className="text-xs mt-0.5">
              {aggregates.byProvider.map((p) => `${p.provider}: ${p.count}`).join(" · ")}
            </div>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex gap-4 items-end flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Signature</Label>
            <Select value={filterValid || "ALL"} onValueChange={(v) => setFilterValid(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="true">Valid only</SelectItem>
                <SelectItem value="false">Invalid only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={unprocessedOnly} onChange={(e) => setUnprocessedOnly(e.target.checked)} />
            Unprocessed only
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Webhook events ({total})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <ul className="divide-y max-h-[600px] overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{e.provider}</Badge>
                    <Badge variant="secondary" className="text-xs">{e.eventType}</Badge>
                    {!e.signatureValid && <Badge variant="destructive" className="text-xs">invalid signature</Badge>}
                    {e.processedAt ? <Badge variant="default" className="text-xs">processed</Badge> : <Badge variant="outline" className="text-xs text-amber-700 border-amber-500">unprocessed</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {timeAgo(e.createdAt)}
                    {e.providerEventId && ` · event: ${e.providerEventId.slice(0, 24)}…`}
                  </div>
                  {e.fundingRecord && (
                    <div className="text-xs mt-1">
                      Funding: {formatMinor(e.fundingRecord.amountMinor, e.fundingRecord.currency)} ·{" "}
                      {e.fundingRecord.project.title} · status: {e.fundingRecord.status}
                    </div>
                  )}
                  <details className="mt-1">
                    <summary className="text-xs cursor-pointer text-muted-foreground">View payload</summary>
                    <pre className="text-xs bg-muted/50 rounded p-2 mt-1 overflow-x-auto">{e.payload}</pre>
                  </details>
                </li>
              ))}
              {events.length === 0 && <li className="p-6 text-center text-muted-foreground">No webhook events.</li>}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <AlertTriangle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="font-semibold mb-1">Failed to load</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <Button onClick={onRetry} variant="outline"><ArrowRight className="h-4 w-4 mr-2" /> Retry</Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// KYC tab
// ---------------------------------------------------------------------------

type AdminKyc = {
  id: string;
  status: string;
  provider: string;
  ninNumberLast4: string;
  fullName: string;
  selfieMatch: boolean | null;
  livenessPassed: boolean | null;
  confidenceScore: number | null;
  failureReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  user: { id: string; displayName: string; email: string };
};

function KycTab() {
  const [verifications, setVerifications] = useState<AdminKyc[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<{ byStatus: Array<{ status: string; count: number }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    api.get<{ verifications: AdminKyc[]; total: number; aggregates: typeof aggregates }>(`/api/admin/kyc?${params.toString()}`)
      .then((r) => { setVerifications(r.verifications); setTotal(r.total); setAggregates(r.aggregates); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div className="space-y-4">
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {aggregates.byStatus.map((s) => (
            <Card key={s.status}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{s.status}</div>
                <div className="font-semibold mt-0.5">{s.count}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Status filter</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">KYC Verifications ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Provider</th>
                    <th className="text-left p-2">NIN</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-center p-2">Selfie</th>
                    <th className="text-center p-2">Liveness</th>
                    <th className="text-right p-2">Score</th>
                    <th className="text-left p-2">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No KYC verifications yet.</td></tr>
                  )}
                  {verifications.map((v) => (
                    <tr key={v.id} className="border-t hover:bg-muted/30 align-top">
                      <td className="p-2">
                        <div className="font-medium">{v.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">{v.user.email}</div>
                      </td>
                      <td className="p-2">
                        <Badge variant={v.status === "VERIFIED" ? "default" : v.status === "REJECTED" ? "destructive" : "secondary"} className="text-xs">
                          {v.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{v.provider}</td>
                      <td className="p-2 text-xs font-mono">****{v.ninNumberLast4}</td>
                      <td className="p-2 text-xs">{v.fullName}</td>
                      <td className="p-2 text-center">
                        {v.selfieMatch === true ? <CheckCircle2 className="h-4 w-4 text-primary inline" /> :
                         v.selfieMatch === false ? <XCircle className="h-4 w-4 text-destructive inline" /> : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {v.livenessPassed === true ? <CheckCircle2 className="h-4 w-4 text-primary inline" /> :
                         v.livenessPassed === false ? <XCircle className="h-4 w-4 text-destructive inline" /> : "—"}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {v.confidenceScore ? `${v.confidenceScore.toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {v.verifiedAt ? formatDateTime(v.verifiedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

type AdminPayment = {
  id: string;
  paymentReference: string;
  provider: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  feeMinor: number;
  netMinor: number;
  feeRateBps: number;
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  user: { id: string; displayName: string; email: string };
  project: { id: string; title: string } | null;
  milestone: { id: string; title: string } | null;
};

function PaymentsTab() {
  const [transactions, setTransactions] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<{
    byStatus: Array<{ status: string; count: number }>;
    byProvider: Array<{ provider: string; count: number }>;
    totalAmountMinor: number;
    totalFeeMinor: number;
    totalNetMinor: number;
    totalCount: number;
  } | null>(null);
  const [providers, setProviders] = useState<Array<{ name: string; enabled: boolean; configured: boolean; environment: string; message: string }>>([]);
  const [livePayments, setLivePayments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const [fundingRecords, setFundingRecords] = useState<FundingRecord[]>([]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    Promise.all([
      api.get<{
        transactions: AdminPayment[];
        total: number;
        aggregates: typeof aggregates;
        providers: typeof providers;
        livePaymentsEnabled: boolean;
      }>(`/api/admin/payments?${params.toString()}`),
      api.get<{ records: FundingRecord[]; total: number }>(`/api/admin/funding?limit=10`),
    ])
      .then(([payData, fundData]) => {
        setTransactions(payData.transactions);
        setTotal(payData.total);
        setAggregates(payData.aggregates);
        setProviders(payData.providers);
        setLivePayments(payData.livePaymentsEnabled);
        setFundingRecords(fundData.records ?? []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter]);

  return (
    <div className="space-y-4">
      {/* Provider status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Providers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {providers.map((p) => (
              <div key={p.name} className="border rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize">{p.name}</span>
                  <Badge variant={p.enabled ? "default" : "secondary"} className="text-xs">
                    {p.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{p.message}</div>
                <div className="text-xs text-muted-foreground mt-1">Env: {p.environment}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Badge variant={livePayments ? "default" : "outline"}>
              {livePayments ? "Live payments ON" : "Live payments OFF"}
            </Badge>
            <span className="text-muted-foreground">Fee rate: {process.env.PLATFORM_FEE_BPS ?? "150"} bps (1.5%)</span>
          </div>
        </CardContent>
      </Card>

      {/* Aggregates */}
      {aggregates && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Volume</div>
            <div className="font-semibold mt-0.5">{formatMinor(aggregates.totalAmountMinor, "NGN")}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Platform Fees</div>
            <div className="font-semibold mt-0.5 text-primary">{formatMinor(aggregates.totalFeeMinor, "NGN")}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Net to Freelancers</div>
            <div className="font-semibold mt-0.5">{formatMinor(aggregates.totalNetMinor, "NGN")}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Transactions</div>
            <div className="font-semibold mt-0.5">{aggregates.totalCount}</div>
          </CardContent></Card>
        </div>
      )}

      {/* Status filter */}
      <Card>
        <CardContent className="p-3">
          <div className="space-y-1">
            <Label className="text-xs">Status filter</Label>
            <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="CREATED">Created</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="SUCCEEDED">Succeeded</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Transactions ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Provider</th>
                    <th className="text-left p-2">Project</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-right p-2">Fee (1.5%)</th>
                    <th className="text-right p-2">Net</th>
                    <th className="text-left p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No payment transactions yet.</td></tr>
                  )}
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <div className="font-medium">{t.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">{t.user.email}</div>
                      </td>
                      <td className="p-2">
                        <Badge variant={t.status === "SUCCEEDED" ? "default" : t.status === "FAILED" ? "destructive" : "secondary"} className="text-xs">
                          {t.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs capitalize">{t.provider}</td>
                      <td className="p-2 text-xs">{t.project?.title ?? "—"}</td>
                      <td className="p-2 text-right font-medium">{formatMinor(t.amountMinor, t.currency)}</td>
                      <td className="p-2 text-right text-primary">{formatMinor(t.feeMinor, t.currency)}</td>
                      <td className="p-2 text-right">{formatMinor(t.netMinor, t.currency)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
