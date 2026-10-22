"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDate, timeAgo } from "@/lib/client-api";
import { UserPlus, Trash2, Loader2, Mail, Copy, Check } from "lucide-react";

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
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground text-sm">Members and pending invitations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Invite</Button>
          </DialogTrigger>
          <InviteDialog projectId={projectId} onCreated={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Members ({members.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pending invitations ({invitations.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {invitations.map((inv) => {
                const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
                const inviteUrl = `${baseUrl}/?view=invitation&token=SEE_DEV_LOG&project=${projectId}`;
                return (
                  <li key={inv.id} className="p-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {inv.invitee?.displayName ?? inv.invitee ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Invited as {inv.role.toLowerCase()} by {inv.inviter.displayName} · {timeAgo(inv.createdAt)}
                      </div>
                    </div>
                    <Badge variant={inv.status === "PENDING" ? "outline" : "secondary"} className="text-xs">{inv.status}</Badge>
                    {inv.status === "PENDING" && (
                      <Button variant="ghost" size="sm" onClick={() => copyInviteUrl(inviteUrl)}>
                        {copied === inviteUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
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
    </div>
  );
}

function InviteDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
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
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Invite Service Provider</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} placeholder="service-provider@example.com" />
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
          <div className="text-xs space-y-1">
            <div className="text-muted-foreground">Invitation link (dev mode):</div>
            <div className="font-mono break-all p-2 bg-muted rounded">{inviteUrl}</div>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteUrl); }}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading || !inviteeEmail}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
          Send invitation
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
