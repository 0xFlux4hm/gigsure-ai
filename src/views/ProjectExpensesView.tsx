"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, formatMinor, formatDateTime } from "@/lib/client-api";
import { Loader2, Plus, Receipt, Check, X, Upload, Info } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";

type Expense = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  amountMinor: number;
  currency: string;
  status: string;
  rejectionReason: string | null;
  receiptUrl: string | null;
  receiptUploadedAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  releasedAt: string | null;
  requestedBy: { id: string; displayName: string; email: string };
  approvedBy: { id: string; displayName: string } | null;
  milestone: { id: string; title: string; status: string };
  fundingRecord: { id: string; status: string } | null;
};

type Milestone = {
  id: string;
  title: string;
  status: string;
  amountMinor: number;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "DOMAIN_HOSTING", label: "Domain & Hosting" },
  { value: "SOFTWARE_LICENSE", label: "Software License" },
  { value: "STOCK_ASSETS", label: "Stock Assets" },
  { value: "THIRD_PARTY_SERVICES", label: "Third-party Services" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "OTHER", label: "Other" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    REQUESTED: { variant: "secondary", label: "Pending Approval" },
    APPROVED: { variant: "default", label: "Approved" },
    RELEASED: { variant: "default", label: "Released" },
    REJECTED: { variant: "destructive", label: "Rejected" },
    DISPUTED: { variant: "outline", label: "Disputed" },
  };
  const config = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function ProjectExpensesView({ projectId }: { projectId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    milestoneId: "",
    title: "",
    description: "",
    category: "DOMAIN_HOSTING",
    amount: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ expenses: Expense[] }>(`/api/projects/${projectId}/expenses`),
      api.get<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`).catch(() => ({ milestones: [] })),
    ])
      .then(([e, m]) => {
        setExpenses(e.expenses);
        setMilestones(m.milestones.filter((ms) => ["FUNDED", "SUBMITTED", "APPROVED"].includes(ms.status)));
      })
      .catch((err) => setError(err?.message ?? "Failed to load expenses"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!formState.milestoneId) return setError("Select a milestone");
    const amountMinor = Math.round(parseFloat(formState.amount) * 100);
    if (!amountMinor || amountMinor <= 0) return setError("Enter a valid amount");

    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/expenses`, {
        milestoneId: formState.milestoneId,
        title: formState.title,
        description: formState.description || undefined,
        category: formState.category,
        amountMinor,
      });
      setSuccess("Expense request submitted. The client will be notified to approve.");
      toast.success("Expense request submitted", { description: "The client will be notified to approve." });
      setFormState({ milestoneId: "", title: "", description: "", category: "DOMAIN_HOSTING", amount: "" });
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit expense");
      toast.error("Failed to submit expense", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(expenseId: string) {
    try {
      await api.post(`/api/projects/${projectId}/expenses/${expenseId}/approve`, {});
      setSuccess("Expense approved. Click 'Release' to send the funds.");
      toast.success("Expense approved", { description: "Funds are ready to release." });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
      toast.error("Failed to approve expense", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function handleReject(expenseId: string) {
    const reason = prompt("Reason for rejection:");
    if (!reason) return;
    try {
      await api.post(`/api/projects/${projectId}/expenses/${expenseId}/reject`, { reason });
      toast.success("Expense rejected", { description: "The requester has been notified." });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
      toast.error("Failed to reject expense", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function handleRelease(expenseId: string) {
    if (!confirm("Release the funds to the service provider's bank account?")) return;
    try {
      await api.post(`/api/projects/${projectId}/expenses/${expenseId}/release`, {});
      setSuccess("Funds released. The service provider will receive the payout shortly.");
      toast.success("Funds released", { description: "Payout to the service provider has been queued." });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release");
      toast.error("Failed to release funds", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function handleUploadReceipt(expenseId: string) {
    const url = prompt("Paste the receipt URL (or upload link):");
    if (!url) return;
    try {
      await api.post(`/api/projects/${projectId}/expenses/${expenseId}/receipt`, { receiptUrl: url });
      setSuccess("Receipt uploaded.");
      toast.success("Receipt uploaded", { description: "The receipt URL has been saved." });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload receipt");
      toast.error("Failed to upload receipt", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  if (loading) {
    return <LoadingState label="Loading expenses…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Project expenses"
        description="Service providers can request funds from funded milestones for project-related expenses (domain, hosting, software)."
        icon={Receipt}
        actions={
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Request Expense
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request expense funds</DialogTitle>
              <DialogDescription>
                Request a partial release of milestone funds for project expenses. The client must approve before funds are released.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="milestone">Milestone</Label>
                <Select value={formState.milestoneId} onValueChange={(v) => setFormState((s) => ({ ...s, milestoneId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a funded milestone" /></SelectTrigger>
                  <SelectContent>
                    {milestones.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title} — {formatMinor(m.amountMinor, "NGN")} ({formatStatus(m.status)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input className="input-premium"
                  id="title"
                  value={formState.title}
                  onChange={(e) => setFormState((s) => ({ ...s, title: e.target.value }))}
                  placeholder="e.g., Domain and hosting for 1 year"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={formState.category} onValueChange={(v) => setFormState((s) => ({ ...s, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input className="input-premium"
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formState.amount}
                  onChange={(e) => setFormState((s) => ({ ...s, amount: e.target.value }))}
                  placeholder="e.g., 50000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description (optional)</Label>
                <Textarea
                  id="desc"
                  value={formState.description}
                  onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Breakdown: domain ₦15,000, hosting ₦25,000, theme ₦10,000"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-base">All Expenses ({expenses.length})</CardTitle>
          <CardDescription>
            Funds are released from already-funded milestones. The client approves each request before release.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expense requests yet"
              description="Service providers can request funds from funded milestones for project expenses."
            />
          ) : (
            <div className="divide-y">
              {expenses.map((exp) => (
                <div key={exp.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{exp.title}</span>
                        <StatusBadge status={exp.status} />
                        <Badge variant="outline" className="text-xs badge-info">
                          {CATEGORIES.find((c) => c.value === exp.category)?.label ?? exp.category}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {exp.milestone.title} · Requested by {exp.requestedBy.displayName}
                      </div>
                      {exp.description && (
                        <div className="text-sm text-muted-foreground">{exp.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Requested {formatDateTime(exp.createdAt)}
                        {exp.approvedAt && ` · Approved ${formatDateTime(exp.approvedAt)}`}
                        {exp.releasedAt && ` · Released ${formatDateTime(exp.releasedAt)}`}
                      </div>
                      {exp.rejectionReason && (
                        <div className="text-xs text-destructive">Rejected: {exp.rejectionReason}</div>
                      )}
                      {exp.receiptUrl && (
                        <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                          <Upload className="h-3 w-3" /> View receipt
                        </a>
                      )}
                    </div>
                    <div className="text-right space-y-2">
                      <div className="font-semibold">{formatMinor(exp.amountMinor, exp.currency)}</div>
                      <div className="flex flex-col gap-1">
                        {exp.status === "REQUESTED" && (
                          <>
                            <Button size="sm" onClick={() => handleApprove(exp.id)}>
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleReject(exp.id)}>
                              <X className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {exp.status === "APPROVED" && (
                          <Button size="sm" onClick={() => handleRelease(exp.id)}>
                            Release Funds
                          </Button>
                        )}
                        {exp.status === "RELEASED" && !exp.receiptUrl && (
                          <Button size="sm" variant="outline" onClick={() => handleUploadReceipt(exp.id)}>
                            <Upload className="h-3 w-3 mr-1" /> Upload Receipt
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>How it works:</strong> The milestone must be funded first (client transfers to the virtual account).
          Then the service provider requests an expense, the client approves, and the platform releases the funds
          from the milestone's held balance to the service provider's bank account.
        </AlertDescription>
      </Alert>
    </div>
  );
}
