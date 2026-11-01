"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { api, formatMinor, formatDateTime } from "@/lib/client-api";
import { Plus, Loader2, CheckCircle2, Info, Wallet } from "lucide-react";

import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";
type Allocation = {
  id: string;
  userId: string;
  role: string;
  amountMinor: number;
  percentageBps: number;
  notes: string | null;
};

type Agreement = {
  id: string;
  versionNumber: number;
  totalDistributableMinor: number;
  currency: string;
  status: string;
  notes: string | null;
  createdAt: string;
  allocations: Allocation[];
  acceptances: Array<{ userId: string; acceptedAt: string }>;
};

export function ProjectCompensationView({ projectId }: { projectId: string }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Array<{ user: { id: string; displayName: string }; role: string }>>([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<{ agreements: Agreement[] }>(`/api/projects/${projectId}/compensation`).then((r) => setAgreements(r.agreements)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);
  useEffect(() => {
    api.get<{ members: Array<{ user: { id: string; displayName: string }; role: string }> }>(`/api/projects/${projectId}/members`).then((r) => setMembers(r.members));
  }, [projectId]);

  const accept = async (agreementId: string) => {
    try {
      await api.post(`/api/projects/${projectId}/compensation/${agreementId}/accept`);
      toast.success("Compensation accepted", { description: "Your allocation has been accepted." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) {
    return <LoadingState label="Loading compensation agreements…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Compensation agreements"
        description="Internal allocations among service providers. Versioned. Each recipient must accept their own."
        icon={Wallet}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New agreement</Button></DialogTrigger>
            <NewAgreementDialog projectId={projectId} members={members} onCreated={() => { setOpen(false); load(); }} />
          </Dialog>
        }
      />

      <Card className="premium-card">
        <CardContent className="p-4 flex items-start gap-3 bg-muted/30">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            A compensation agreement defines how a project&apos;s distributable
            budget is split among service providers. It is <strong>not</strong> a
            payment. It does not transfer funds. A compensation allocation is
            advisory — actual transfers require a verified provider arrangement.
          </div>
        </CardContent>
      </Card>

      {agreements.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No agreements yet"
          description="Propose a compensation agreement to define how the distributable budget is split among service providers."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New agreement
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {agreements.map((a) => {
            const sum = a.allocations.reduce((s, x) => s + x.amountMinor, 0);
            const matches = sum === a.totalDistributableMinor;
            return (
              <Card className="premium-card" key={a.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">Version {a.versionNumber}</CardTitle>
                    <Badge variant={a.status === "ACCEPTED" ? "default" : "outline"}>{a.status}</Badge>
                  </div>
                  <CardDescription>
                    {formatMinor(a.totalDistributableMinor, a.currency)} total · {formatDateTime(a.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs text-muted-foreground">
                        <TableHead>Recipient</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-center">Accepted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.allocations.map((al) => {
                        const member = members.find((m) => m.user.id === al.userId);
                        const accepted = a.acceptances.find((x) => x.userId === al.userId);
                        return (
                          <TableRow key={al.id}>
                            <TableCell className="py-2">{member?.user.displayName ?? "—"}</TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground">{al.role}</TableCell>
                            <TableCell className="py-2 text-right font-medium">{formatMinor(al.amountMinor, a.currency)}</TableCell>
                            <TableCell className="py-2 text-right">{(al.percentageBps / 100).toFixed(2)}%</TableCell>
                            <TableCell className="py-2 text-center">
                              {accepted ? <CheckCircle2 className="h-4 w-4 text-primary inline" /> : <span className="text-xs text-muted-foreground">pending</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="font-medium">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{formatMinor(sum, a.currency)}</TableCell>
                        <TableCell className="text-right" colSpan={2}>
                          {matches ? (
                            <Badge variant="outline" className="text-xs text-primary badge-info">matches total</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs badge-danger">mismatch</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
                  {a.status === "PROPOSED" && (
                    <Button onClick={() => accept(a.id)} size="sm">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Accept my allocation
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewAgreementDialog({ projectId, members, onCreated }: { projectId: string; members: Array<{ user: { id: string; displayName: string }; role: string }>; onCreated: () => void }) {
  const [currency, setCurrency] = useState("NGN");
  const [total, setTotal] = useState("0");
  const [allocations, setAllocations] = useState<Array<{ userId: string; role: string; amount: string; percentage: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addAllocation = () => setAllocations((a) => [...a, { userId: "", role: "COLLABORATOR", amount: "0", percentage: "0" }]);
  const updateAllocation = (i: number, k: string, v: string) => setAllocations((a) => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const removeAllocation = (i: number) => setAllocations((a) => a.filter((_, idx) => idx !== i));

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/compensation`, {
        totalDistributable: Number(total) || 0,
        currency,
        allocations: allocations.map((a) => ({
          userId: a.userId,
          role: a.role,
          amountMinor: Math.round(Number(a.amount) * 100),
          percentageBps: Math.round(Number(a.percentage) * 100),
        })),
        enforceTotalMatch: true,
      });
      toast.success("Compensation agreement proposed", { description: "Recipients can now review and accept their allocations." });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to propose agreement", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const sum = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const matches = Math.abs(sum - (Number(total) || 0)) < 0.01;

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>New compensation agreement</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">NGN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="GHS">GHS</SelectItem>
                <SelectItem value="KES">KES</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Total distributable</Label>
            <Input className="input-premium" type="number" min="0" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Allocations</Label>
            <Button size="sm" variant="outline" onClick={addAllocation}>Add</Button>
          </div>
          <div className="space-y-2">
            {allocations.map((a, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1">
                  <Label className="text-xs">Recipient</Label>
                  <Select
                    value={a.userId}
                    onValueChange={(v) => updateAllocation(i, "userId", v)}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Select member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user.id} value={m.user.id}>
                          {m.user.displayName} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input className="text-sm input-premium" type="number" value={a.amount} onChange={(e) => updateAllocation(i, "amount", e.target.value)} />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Percentage</Label>
                  <Input className="text-sm input-premium" type="number" value={a.percentage} onChange={(e) => updateAllocation(i, "percentage", e.target.value)} />
                </div>
                <div className="col-span-1">
                  <Button size="sm" variant="ghost" onClick={() => removeAllocation(i)}>×</Button>
                </div>
              </div>
            ))}
          </div>
          {allocations.length > 0 && (
            <div className="mt-2 text-sm">
              Sum: <span className={matches ? "text-primary font-medium" : "text-destructive font-medium"}>{sum}</span> / {total}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading || !matches || allocations.length === 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Propose agreement
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
