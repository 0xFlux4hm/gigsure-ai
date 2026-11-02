"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { api, formatDate, formatMinor } from "@/lib/client-api";
import { Plus, Loader2, ArrowRight, AlertTriangle, Target } from "lucide-react";

import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";
type Milestone = {
  id: string;
  title: string;
  description: string | null;
  amountMinor: number;
  dueDate: string | null;
  status: string;
  orderIndex: number;
  tasks: Array<{ id: string; title: string; status: string }>;
  fundingRecords: Array<{ id: string; type: string; status: string; amountMinor: number }>;
};

export function ProjectMilestonesView({ projectId }: { projectId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<{ currency: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`).then((r) => setMilestones(r.milestones)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);
  useEffect(() => {
    api.get<{ currency: string }>(`/api/projects/${projectId}`).then(setProject);
  }, [projectId]);

  const submit_milestone = async (id: string) => {
    try {
      await api.post(`/api/projects/${projectId}/milestones/${id}/submit`);
      toast.success("Milestone submitted", { description: "Submitted for client approval." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const approve_milestone = async (id: string, decision: "APPROVED" | "CHANGES_REQUESTED") => {
    try {
      await api.post(`/api/projects/${projectId}/milestones/${id}/approve`, { decision, note: "" });
      if (decision === "APPROVED") {
        toast.success("Milestone approved", { description: "Funds are now eligible for release." });
      } else {
        toast.success("Changes requested", { description: "The service provider has been notified." });
      }
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <LoadingState label="Loading milestones…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Milestones"
        description="Fund, submit, approve, release. State transitions enforced on the backend."
        icon={Target}
        actions={
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> New milestone</Button>
        }
      />

      {milestones.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No milestones yet"
          description="Create a milestone to start tracking funding and delivery."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New milestone
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => {
            const fundingConfirmed = m.fundingRecords.some(
              (f) => f.type === "FUNDING" && f.status === "PROVIDER_CONFIRMED",
            );
            const disputed = m.status === "DISPUTED";
            return (
              <Card key={m.id} className={disputed ? "border-amber-500 premium-card" : " premium-card"}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold">{m.title}</h3>
                        <Badge variant={disputed ? "destructive" : m.status === "RELEASED" ? "default" : "outline"}>{formatStatus(m.status)}</Badge>
                        {fundingConfirmed && <Badge variant="secondary" className="text-xs badge-warning">funded</Badge>}
                      </div>
                      {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                      <div className="text-xs text-muted-foreground mt-1">
                        {m.dueDate && `Due ${formatDate(m.dueDate)} · `}
                        {m.tasks.length} task{m.tasks.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{formatMinor(m.amountMinor, project?.currency ?? "NGN")}</div>
                    </div>
                  </div>

                  {disputed && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                      <AlertTriangle className="h-4 w-4" />
                      Milestone is under dispute — normal release is blocked.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {m.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await api.post(`/api/projects/${projectId}/funding`, {
                              type: "FUNDING",
                              milestoneId: m.id,
                              amountMinor: m.amountMinor,
                            });
                            toast.success("Funding initiated", { description: "Milestone funding request has been recorded." });
                            load();
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        Initiate funding
                      </Button>
                    )}
                    {m.status === "FUNDED" && (
                      <Button size="sm" onClick={() => submit_milestone(m.id)}>
                        Submit for approval <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    )}
                    {m.status === "SUBMITTED" && (
                      <>
                        <Button size="sm" onClick={() => approve_milestone(m.id, "APPROVED")}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => approve_milestone(m.id, "CHANGES_REQUESTED")}>Request changes</Button>
                      </>
                    )}
                    {m.status === "APPROVED" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await api.post(`/api/projects/${projectId}/funding`, {
                              type: "RELEASE",
                              milestoneId: m.id,
                              amountMinor: m.amountMinor,
                            });
                            toast.success("Release initiated", { description: "Payout to the service provider has been queued." });
                            load();
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        Initiate release
                      </Button>
                    )}
                  </div>

                  {m.fundingRecords.length > 0 && (
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">Funding history</div>
                      <ul className="space-y-1">
                        {m.fundingRecords.map((f) => (
                          <li key={f.id} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] badge-info">{f.type}</Badge>
                            <span>{formatMinor(f.amountMinor, project?.currency ?? "NGN")}</span>
                            <Badge variant="secondary" className="text-[10px] badge-warning">{formatStatus(f.status)}</Badge>
                            
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewMilestoneDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => { setOpen(false); load(); }}
      />
    </div>
  );
}

function NewMilestoneDialog({ projectId, open, onOpenChange, onCreated }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline validation — prevents the silent 422 that happens when the
  // schema's min(1) check on amountMinor fails because the user left
  // the amount at its previous default of "0".
  const titleValid = title.trim().length >= 2;
  const amountNum = Number(amount || "0");
  const amountValid = amount.trim() !== "" && amountNum > 0 && Number.isFinite(amountNum);
  const canSubmit = titleValid && amountValid && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/milestones`, {
        title: title.trim(),
        description: description.trim() || undefined,
        amountMinor: Math.round(amountNum * 100),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      toast.success("Milestone created", { description: `"${title}" has been added to the project.` });
      onCreated();
    } catch (err) {
      const msg = (err as Error).message || "";
      // The server returns a generic "Invalid milestone" on Zod failure (by design,
      // to prevent schema probing). Translate it back to a useful hint for the user.
      const friendly = msg.includes("Invalid milestone")
        ? "Please enter a valid title and an amount greater than zero."
        : msg;
      setError(friendly);
      toast.error("Failed to create milestone", { description: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>New milestone</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input className="input-premium" id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Design mockups" inputMode="text" autoCapitalize="sentences" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="resize-y" placeholder="What this milestone delivers" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (major units) <span className="text-destructive">*</span></Label>
              <Input className="input-premium" id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" inputMode="decimal" />
              {amount.trim() !== "" && !amountValid && (
                <p className="text-xs text-destructive">Enter an amount greater than 0.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Due date</Label>
              <Input className="input-premium" id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {error && <div className="text-sm text-destructive p-2 rounded-md bg-destructive/5 border border-destructive/20">{error}</div>}
        </div>
        <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
          <Button onClick={submit} disabled={!canSubmit} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create milestone
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
