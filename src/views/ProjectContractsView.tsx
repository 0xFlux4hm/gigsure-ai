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
import { Plus, Loader2, CheckCircle2, History, GitCompare, FileText } from "lucide-react";
import { ContractRiskAnalyzer } from "@/views/ContractRiskAnalyzer";
import { NewContractForm } from "@/components/contracts/NewContractForm";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";

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
  const [formOpen, setFormOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
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
      toast.success("Contract version accepted", { description: "Your acceptance has been recorded." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <LoadingState label="Loading contracts…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Contracts"
        description="Versioned. Accepted terms are preserved."
        icon={FileText}
        actions={
          <div className="flex items-center gap-2">
            {versions.length >= 2 && (
              <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><GitCompare className="mr-2 h-4 w-4" /> Compare</Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader><DialogTitle>Compare contract versions</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label className="text-xs">Version A</Label>
                      <Select value={compareA} onValueChange={setCompareA}>
                        <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => <SelectItem key={v.id} value={v.id}>Version {v.versionNumber}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Version B</Label>
                      <Select value={compareB} onValueChange={setCompareB}>
                        <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => <SelectItem key={v.id} value={v.id}>Version {v.versionNumber}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {compareA && compareB && compareA !== compareB && (
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                      {(() => {
                        const a = versions.find((v) => v.id === compareA);
                        const b = versions.find((v) => v.id === compareB);
                        if (!a || !b) return null;
                        const fields = [
                          { label: "Scope of work", aVal: a.scopeOfWork, bVal: b.scopeOfWork },
                          { label: "Deliverables", aVal: a.deliverables, bVal: b.deliverables },
                          { label: "Deadlines", aVal: a.deadlines || "—", bVal: b.deadlines || "—" },
                          { label: "Payment schedule", aVal: a.paymentSchedule || "—", bVal: b.paymentSchedule || "—" },
                          { label: "Milestone conditions", aVal: a.milestoneConditions || "—", bVal: b.milestoneConditions || "—" },
                          { label: "Revision rules", aVal: a.revisionRules || "—", bVal: b.revisionRules || "—" },
                          { label: "Cancellation terms", aVal: a.cancellationTerms || "—", bVal: b.cancellationTerms || "—" },
                          { label: "Dispute procedures", aVal: a.disputeProcedures || "—", bVal: b.disputeProcedures || "—" },
                        ];
                        return fields.map((f) => {
                          const changed = f.aVal !== f.bVal;
                          return (
                            <div key={f.label} className={`grid grid-cols-2 gap-2 p-2 rounded ${changed ? "bg-amber-500/10 border border-amber-500/30" : ""}`}>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                                <div className="text-sm whitespace-pre-wrap">{f.aVal || "—"}</div>
                              </div>
                              <div className={changed ? "border-l-2 border-amber-500 pl-2" : "border-l pl-2"}>
                                <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                                <div className="text-sm whitespace-pre-wrap">{f.bVal || "—"}</div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  {compareA && compareB && compareA === compareB && (
                    <p className="text-sm text-muted-foreground text-center py-4">Select two different versions to compare.</p>
                  )}
                </DialogContent>
              </Dialog>
            )}
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New version
            </Button>
          </div>
        }
      />

      {versions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No contracts yet"
          description="Create a contract version to formalize scope with your client."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create version
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {versions.map((v) => (
            <Card className="premium-card" key={v.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" /> Version {v.versionNumber}
                  </CardTitle>
                  <Badge variant={v.status === "ACCEPTED" ? "default" : v.status === "SUPERSEDED" ? "secondary" : "outline"}>
                    {formatStatus(v.status)}
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

                <div className="border-t pt-3">
                  <ContractRiskAnalyzer contractVersionId={v.id} />
                </div>

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

      {/* New contract version form — responsive Sheet (full-screen on mobile) */}
      <NewContractForm
        projectId={projectId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={load}
        previousVersion={versions[0] ?? null}
      />
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
