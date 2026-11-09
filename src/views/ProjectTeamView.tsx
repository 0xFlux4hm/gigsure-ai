"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, timeAgo, formatDate } from "@/lib/client-api";
import {
  UserPlus,
  Trash2,
  Loader2,
  Mail,
  Copy,
  Check,
  Users,
  X,
  Search,
  Send,
  MoreVertical,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { toast } from "sonner";
import { formatStatus } from "@/components/shared/page-components";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";
import { useConfirm } from "@/components/shared/ConfirmDialog";

type Member = {
  id: string;
  role: string;
  joinedAt: string;
  user: { id: string; displayName: string; email: string; profile?: { professionalRole?: string | null; headline?: string | null } | null };
};

type Invitation = {
  id: string;
  role: string;
  status: string;
  inviteeEmail: string | null;
  invitee: { id: string; displayName: string } | null;
  inviter: { id: string; displayName: string; email: string };
  expiresAt: string;
  createdAt: string;
  personalMessage?: string | null;
  lastResentAt?: string | null;
  resendCount?: number;
};

export function ProjectTeamView({ projectId }: { projectId: string }) {
  const { confirm } = useConfirm();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  // Invitation management: search + filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Member management
  const [actingMemberId, setActingMemberId] = useState<string | null>(null);

  // Permission helpers — based on the existing backend permission model:
  // project:invite → OWNER only
  // project:manage_team → OWNER + TEAM_LEAD
  const canInvite = myRole === "OWNER";
  const canManageTeam = myRole === "OWNER" || myRole === "TEAM_LEAD";

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<{ members: Member[] }>(`/api/projects/${projectId}/members`).then((r) => setMembers(r.members)).catch(() => setMembers([])),
      api.get<{ invitations: Invitation[] }>(`/api/projects/${projectId}/invitations`).then((r) => setInvitations(r.invitations)).catch(() => setInvitations([])),
      api.get<{ myRole: string | null }>(`/api/projects/${projectId}`).then((r) => setMyRole(r.myRole)).catch(() => setMyRole(null)),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied to clipboard");
  };

  const revoke = async (id: string) => {
    const result = await confirm({
      title: "Revoke invitation?",
      description: "The recipient will no longer be able to accept this invitation.",
      confirmText: "Revoke",
      variant: "destructive",
    });
    if (!result.ok) return;
    try {
      await api.del(`/api/projects/${projectId}/invitations/${id}`);
      toast.success("Invitation revoked", { description: "The invitation has been cancelled." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const resend = async (id: string) => {
    try {
      const res = await api.post<{ inviteUrl?: string; message?: string }>(
        `/api/projects/${projectId}/invitations/${id}/resend`,
      );
      toast.success("Invitation resent", { description: res.message ?? "A new link has been generated." });
      if (res.inviteUrl) {
        copyToClipboard(res.inviteUrl);
      }
      load();
    } catch (err) {
      toast.error("Resend failed", { description: (err as Error).message });
    }
  };

  const changeRole = async (memberId: string, newRole: string) => {
    setActingMemberId(memberId);
    try {
      await api.patch(`/api/projects/${projectId}/members/${memberId}`, { role: newRole });
      toast.success("Role updated", { description: `Member is now a ${newRole.toLowerCase()}.` });
      load();
    } catch (err) {
      toast.error("Role change failed", { description: (err as Error).message });
    } finally {
      setActingMemberId(null);
    }
  };

  const removeMember = async (memberId: string, name: string) => {
    const result = await confirm({
      title: `Remove ${name}?`,
      description: "They will lose all access to this project immediately.",
      confirmText: "Remove member",
      variant: "destructive",
    });
    if (!result.ok) return;
    setActingMemberId(memberId);
    try {
      await api.del(`/api/projects/${projectId}/members/${memberId}`);
      toast.success("Member removed", { description: `${name} has been removed from the project.` });
      load();
    } catch (err) {
      toast.error("Removal failed", { description: (err as Error).message });
    } finally {
      setActingMemberId(null);
    }
  };

  // Filter invitations by search + status
  const filteredInvitations = invitations.filter((inv) => {
    const email = inv.invitee?.displayName ?? inv.inviteeEmail ?? "";
    const matchesSearch = !search || email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = invitations.filter((i) => i.status === "PENDING").length;
  const acceptedCount = invitations.filter((i) => i.status === "ACCEPTED").length;

  // Split into Active (PENDING + ACCEPTED) and History (EXPIRED, REVOKED, REJECTED)
  const activeInvitations = filteredInvitations.filter(
    (inv) => inv.status === "PENDING" || inv.status === "ACCEPTED",
  );
  const historyInvitations = filteredInvitations.filter(
    (inv) => inv.status === "EXPIRED" || inv.status === "REVOKED" || inv.status === "REJECTED",
  );

  if (loading) {
    return <LoadingState label="Loading team…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Team"
        description={canManageTeam ? "Manage project members and invitations." : "Project members and invitations."}
        icon={Users}
        actions={canInvite ? (
          <Button onClick={() => setOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Invite</Button>
        ) : undefined}
      />

      {/* Members card */}
      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members yet"
              description={canInvite ? "Invite collaborators to join this project." : "No members have joined this project yet."}
              action={canInvite ? <Button onClick={() => setOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Invite</Button> : undefined}
            />
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {m.user.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.user.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.user.email}</div>
                  </div>
                  {m.user.profile?.headline && (
                    <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[200px]">
                      {m.user.profile.headline}
                    </div>
                  )}
                  <Badge variant={m.role === "OWNER" ? "default" : "secondary"} className="text-xs shrink-0">
                    {m.role === "OWNER" ? "Owner" : m.role === "CLIENT" ? "Client" : m.role === "COLLABORATOR" ? "Service Provider" : m.role === "TEAM_LEAD" ? "Team Lead" : m.role === "REVIEWER" ? "Reviewer" : m.role}
                  </Badge>
                  {/* Member management dropdown — only for authorized users, not for OWNER */}
                  {canManageTeam && m.role !== "OWNER" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          disabled={actingMemberId === m.id}
                        >
                          {actingMemberId === m.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem className="text-xs font-medium text-muted-foreground" disabled>
                          <UserCog className="h-3.5 w-3.5 mr-2" /> Change role
                        </DropdownMenuItem>
                        {["COLLABORATOR", "TEAM_LEAD", "REVIEWER"].map((r) => (
                          <DropdownMenuItem
                            key={r}
                            onClick={() => changeRole(m.id, r)}
                            disabled={m.role === r}
                            className="text-xs capitalize pl-6"
                          >
                            {r === "COLLABORATOR" ? "Service Provider" : r === "TEAM_LEAD" ? "Team Lead" : "Reviewer"}
                            {m.role === r && <Check className="h-3 w-3 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => removeMember(m.id, m.user.displayName)}
                          className="text-xs text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Invitations card with search + filter */}
      {/* Search + filter (only if there are invitations) */}
      {invitations.length > 0 && (
        <Card className="premium-card">
          <CardContent className="p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="REJECTED">Declined</SelectItem>
                  <SelectItem value="REVOKED">Revoked</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active invitations */}
      {invitations.length > 0 && activeInvitations.length > 0 && (
        <Card className="premium-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Active invitations ({activeInvitations.length})</span>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && <Badge variant="outline" className="text-[10px] badge-warning">{pendingCount} pending</Badge>}
                {acceptedCount > 0 && <Badge variant="outline" className="text-[10px] badge-success">{acceptedCount} accepted</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {activeInvitations.map((inv) => {
                const inviteeName = inv.invitee?.displayName ?? inv.inviteeEmail ?? "—";
                const isExpired = inv.status === "PENDING" && new Date(inv.expiresAt) < new Date();
                return (
                  <li key={inv.id} className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{inviteeName}</div>
                      <div className="text-xs text-muted-foreground">
                        Invited as {inv.role === "COLLABORATOR" ? "Service Provider" : inv.role === "TEAM_LEAD" ? "Team Lead" : "Reviewer"} by {inv.inviter.displayName} · {timeAgo(inv.createdAt)}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex flex-wrap gap-x-3">
                        <span>Sent: {formatDate(inv.createdAt)}</span>
                        <span>Expires: {formatDate(inv.expiresAt)}</span>
                        {inv.lastResentAt && (<span>Last resent: {timeAgo(inv.lastResentAt)}</span>)}
                        {inv.resendCount && inv.resendCount > 0 && (<span>Resent {inv.resendCount}×</span>)}
                      </div>
                      {inv.personalMessage && (
                        <div className="text-[11px] italic text-muted-foreground mt-1 truncate">"{inv.personalMessage}"</div>
                      )}
                    </div>
                    <Badge
                      variant={isExpired ? "secondary" : inv.status === "PENDING" ? "outline" : "secondary"}
                      className={`text-xs shrink-0 ${inv.status === "ACCEPTED" ? "badge-success" : inv.status === "PENDING" && !isExpired ? "badge-warning" : ""}`}
                    >
                      {isExpired ? "Expired" : inv.status === "PENDING" ? "Awaiting response" : "Invitation accepted"}
                    </Badge>
                    {canInvite && inv.status === "PENDING" && !isExpired && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => resend(inv.id)}>
                          <Send className="h-3.5 w-3.5 mr-1" /> Resend
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => revoke(inv.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Invitation history */}
      {invitations.length > 0 && historyInvitations.length > 0 && (
        <Card className="premium-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invitation history ({historyInvitations.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {historyInvitations.map((inv) => {
                const inviteeName = inv.invitee?.displayName ?? inv.inviteeEmail ?? "—";
                return (
                  <li key={inv.id} className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{inviteeName}</div>
                      <div className="text-xs text-muted-foreground">
                        Invited as {inv.role === "COLLABORATOR" ? "Service Provider" : inv.role === "TEAM_LEAD" ? "Team Lead" : "Reviewer"} by {inv.inviter.displayName} · {timeAgo(inv.createdAt)}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0 text-muted-foreground">
                      {inv.status === "EXPIRED" ? "Invitation expired" : inv.status === "REVOKED" ? "Invitation withdrawn" : "Declined"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <InviteDialog projectId={projectId} open={open} onOpenChange={setOpen} onCreated={() => { setOpen(false); load(); }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite Dialog — enhanced with personal message + copy link
// ---------------------------------------------------------------------------

function InviteDialog({ projectId, open, onOpenChange, onCreated }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [role, setRole] = useState("COLLABORATOR");
  const [personalMessage, setPersonalMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ inviteUrl?: string; message?: string; emailSent?: boolean }>(
        `/api/projects/${projectId}/invitations`,
        { inviteeEmail, role, personalMessage: personalMessage.trim() || undefined },
      );
      if (res.inviteUrl) setInviteUrl(res.inviteUrl);
      toast.success("Invitation sent", { description: res.message ?? `An invite has been sent to ${inviteeEmail}.` });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to send invitation", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInviteeEmail("");
    setRole("COLLABORATOR");
    setPersonalMessage("");
    setError(null);
    setInviteUrl(null);
    setCopied(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Invite to project</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleClose(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
            <Input
              className="input-premium"
              id="email"
              type="email"
              value={inviteeEmail}
              onChange={(e) => setInviteeEmail(e.target.value)}
              placeholder="service-provider@example.com"
            />
            <p className="text-xs text-muted-foreground">If they don&apos;t have an account, they can register first.</p>
          </div>

          {/* Role selection with clear descriptions */}
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COLLABORATOR">Service Provider — submit deliverables, accept compensation</SelectItem>
                <SelectItem value="TEAM_LEAD">Team Lead — assign tasks, review deliverables</SelectItem>
                <SelectItem value="REVIEWER">Reviewer — review disputes only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Personal message (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="message">Personal message (optional)</Label>
            <Textarea
              id="message"
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              placeholder="Add a personal note to the invitation…"
              rows={2}
              className="resize-y text-sm"
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground text-right">{personalMessage.length} / 500</p>
          </div>

          {error && (
            <div className="text-sm text-destructive p-2 rounded-md bg-destructive/5 border border-destructive/20">
              {error}
            </div>
          )}

          {/* Invite URL — shown after creation */}
          {inviteUrl && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/40 border border-border/60">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                Invitation created
              </div>
              <div className="flex items-center gap-2">
                <div className="font-mono break-all p-2 bg-background rounded flex-1 text-[11px] border">
                  {inviteUrl}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                    toast.success("Link copied!");
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Share this link directly with the recipient, or wait for the email to arrive.
              </p>
            </div>
          )}
        </div>
        <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
          <Button onClick={submit} disabled={loading || !inviteeEmail} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Send invitation
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
