"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { api, formatDateTime } from "@/lib/client-api";
import { Plus, Loader2, CheckCircle2, History } from "lucide-react";

type Version = {
  id: string;
  versionNumber: number;
  scopeOfWork: string;
  deliverables: string;
  deadlines: string;
  paymentSchedule: string;
  milestoneConditions: string;
  revisionRules: string;
  cancellationTerms: string;
  disputeProcedures: string;
  status: string;
  createdAt: string;
  acceptances: Array<{ userId: string; acceptedAt: string }>;
};

export function ProjectContractsView({ projectId }: { projectId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Array<{ user: { id: string; displayName: string }; role: string }>>([]);

  const load = () => {
    setLoading(true);
    api.get<{ versions: Version[] }>(`/api/projects/${projectId}/contracts`).then((r) => setVersions(r.versions)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  useEffect(() => {
    api.get<{ members: Array<{ user: { id: string; displayName: string }; role: string }> }>(`/api/projects/${projectId}/members`).then((r) => setMembers(r.members));
  }, [projectId]);

  const accept = async (versionId: string) => {
    try {
      await api.post(`/api/projects/${projectId}/contracts/${versionId}/accept`);
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
          <h1 className="text-2xl font-bold">Contracts</h1>
          <p className="text-muted-foreground text-sm">Versioned. Accepted terms are preserved.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New version</Button>
          </DialogTrigger>
          <NewContractDialog
            projectId={projectId}
            onCreated={() => { setOpen(false); load(); }}
          />
        </Dialog>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No contract versions yet. Create one to formalize scope with your client.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {versions.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" /> Version {v.versionNumber}
                  </CardTitle>
                  <Badge variant={v.status === "ACCEPTED" ? "default" : v.status === "SUPERSEDED" ? "secondary" : "outline"}>
                    {v.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Section title="Scope of work">{v.scopeOfWork}</Section>
                <Section title="Deliverables">
                  {v.deliverables ? (
                    <ul className="list-disc list-inside text-sm">
                      {(JSON.parse(v.deliverables) as string[]).map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  ) : "—"}
                </Section>
                {v.deadlines && <Section title="Deadlines">{v.deadlines}</Section>}
                {v.paymentSchedule && <Section title="Payment schedule">{v.paymentSchedule}</Section>}
                {v.milestoneConditions && <Section title="Milestone conditions">{v.milestoneConditions}</Section>}
                {v.revisionRules && <Section title="Revision rules">{v.revisionRules}</Section>}
                {v.cancellationTerms && <Section title="Cancellation terms">{v.cancellationTerms}</Section>}
                {v.disputeProcedures && <Section title="Dispute procedures">{v.disputeProcedures}</Section>}

                <div>
                  <div className="text-xs text-muted-foreground mb-2">Acceptances</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {members.map((m) => {
                      const accepted = v.acceptances.find((a) => a.userId === m.user.id);
                      return (
                        <Badge key={m.user.id} variant={accepted ? "default" : "outline"} className="text-xs">
                          {accepted && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {m.user.displayName} ({m.role.toLowerCase()})
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {v.status === "PROPOSED" && (
                  <Button onClick={() => accept(v.id)} variant="default">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Accept this version
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{title}</div>
      <div className="text-sm whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function NewContractDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [form, setForm] = useState({
    scopeOfWork: "",
    deliverablesText: "",
    deadlines: "",
    paymentSchedule: "",
    milestoneConditions: "",
    revisionRules: "",
    cancellationTerms: "",
    disputeProcedures: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/contracts`, {
        scopeOfWork: form.scopeOfWork,
        deliverables: form.deliverablesText.split("\n").map((s) => s.trim()).filter(Boolean),
        deadlines: form.deadlines,
        paymentSchedule: form.paymentSchedule,
        milestoneConditions: form.milestoneConditions,
        revisionRules: form.revisionRules,
        cancellationTerms: form.cancellationTerms,
        disputeProcedures: form.disputeProcedures,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>New contract version</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label>Scope of work *</Label>
          <Textarea value={form.scopeOfWork} onChange={(e) => set("scopeOfWork", e.target.value)} rows={4} placeholder="What the client wants delivered..." />
        </div>
        <div className="space-y-1.5">
          <Label>Deliverables (one per line)</Label>
          <Textarea value={form.deliverablesText} onChange={(e) => set("deliverablesText", e.target.value)} rows={3} placeholder={"Landing page\nAdmin dashboard\nDocumentation"} />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Deadlines</Label>
            <Textarea value={form.deadlines} onChange={(e) => set("deadlines", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment schedule</Label>
            <Textarea value={form.paymentSchedule} onChange={(e) => set("paymentSchedule", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Milestone conditions</Label>
            <Textarea value={form.milestoneConditions} onChange={(e) => set("milestoneConditions", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Revision rules</Label>
            <Textarea value={form.revisionRules} onChange={(e) => set("revisionRules", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Cancellation terms</Label>
            <Textarea value={form.cancellationTerms} onChange={(e) => set("cancellationTerms", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Dispute procedures</Label>
            <Textarea value={form.disputeProcedures} onChange={(e) => set("disputeProcedures", e.target.value)} rows={2} />
          </div>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading || !form.scopeOfWork}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create version
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
