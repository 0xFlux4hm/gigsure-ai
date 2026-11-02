"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, timeAgo } from "@/lib/client-api";
import { UserPlus, Trash2, Loader2, Mail, Copy, Check, Users, X } from "lucide-react";

import { toast } from "sonner";
import { formatStatus } from "@/components/shared/page-components";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";
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
};

export function ProjectTeamView({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<{ members: Member[] }>(`/api/projects/${projectId}/members`).then((r) => setMembers(r.members)).catch(() => setMembers([])),
      api.get<{ invitations: Invitation[] }>(`/api/projects/${projectId}/invitations`).then((r) => setInvitations(r.invitations)).catch(() => setInvitations([])),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const copyInviteUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this invitation?")) return;
    try {
      await api.del(`/api/projects/${projectId}/invitations/${id}`);
      toast.success("Invitation revoked", { description: "The invitation has been cancelled." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <LoadingState label="Loading team…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Team"
        description="Members and pending invitations."
        icon={Users}
        actions={
          <Button onClick={() => setOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Invite</Button>
        }
      />

      <Card className="premium-card">
        <CardHeader><CardTitle className="text-base">Members ({members.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members yet"
              description="Invite collaborators to join this project."
              action={
                <Button onClick={() => setOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> Invite
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
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
                  <Badge variant={m.role === "OWNER" ? "default" : "secondary"} className="text-xs">{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card className="premium-card">
          <CardHeader><CardTitle className="text-base">Pending invitations ({invitations.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {invitations.map((inv) => {
                const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://gigsure-ai.vercel.app";
                // The invitation token isn't returned by the list API (only the hash
                // is stored). Instead of showing the link, show the invitation details
                // with a "Copy link" button that works from the invite URL generated
                // at creation time (stored in the invite dialog's state).
                // For the list view, just show the status + role.
                return (
                  <li key={inv.id} className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {inv.invitee?.displayName ?? (inv as { inviteeEmail?: string }).inviteeEmail ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Invited as {inv.role.toLowerCase()} by {inv.inviter.displayName} · {timeAgo(inv.createdAt)}
                      </div>
                    </div>
                    <Badge variant={inv.status === "PENDING" ? "outline" : "secondary"} className={`text-xs ${inv.status === "ACCEPTED" ? "badge-success" : inv.status === "PENDING" ? "badge-warning" : ""}`}>
                      {formatStatus(inv.status)}
                    </Badge>
                    {inv.status === "PENDING" && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(inv.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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
function InviteDialog({ projectId, open, onOpenChange, onCreated }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [role, setRole] = useState("COLLABORATOR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ inviteUrl?: string; message?: string }>(`/api/projects/${projectId}/invitations`, {
        inviteeEmail,
        role,
      });
      if (res.inviteUrl) setInviteUrl(res.inviteUrl);
      toast.success("Invitation sent", { description: `An invite has been sent to ${inviteeEmail}.` });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to send invitation", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Invite Service Provider</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input className="input-premium" id="email" type="email" value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} placeholder="service-provider@example.com" />
          <p className="text-xs text-muted-foreground">If they don&apos;t have an account, they can register first.</p>
        </div>
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
        {error && <div className="text-sm text-destructive">{error}</div>}
        {inviteUrl && (
          <div className="text-xs space-y-2">
            <div className="text-muted-foreground font-medium">Share this invitation link:</div>
            <div className="flex items-center gap-2">
              <div className="font-mono break-all p-2 bg-muted rounded flex-1 text-[11px]">{inviteUrl}</div>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Link copied!"); }}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
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
