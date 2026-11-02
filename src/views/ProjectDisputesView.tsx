"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDateTime, timeAgo } from "@/lib/client-api";
import { Plus, Loader2, ChevronRight, Scale } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";

type Dispute = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  milestone: { id: string; title: string } | null;
  opener: { id: string; displayName: string; email: string };
  _count: { evidence: number; messages: number };
};

export function ProjectDisputesView({ projectId }: { projectId: string }) {
  const { navigate } = useNav();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<{ disputes: Dispute[] }>(`/api/projects/${projectId}/disputes`).then((r) => setDisputes(r.disputes)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  if (loading) {
    return <LoadingState label="Loading disputes…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Disputes"
        description="Open disputes with evidence + reviewer notes."
        icon={Scale}
        actions={
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Open dispute</Button>
        }
      />

      {disputes.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No disputes"
          description="Keep it that way. Open a dispute if you ever need to."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Open dispute
            </Button>
          }
        />
      ) : (
        <Card className="premium-card">
          <CardContent className="p-0">
            <ul className="divide-y">
              {disputes.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => navigate({ view: "project-dispute-detail", projectId, disputeId: d.id })}
                    className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{d.title}</h3>
                        <Badge variant="outline" className="text-xs badge-info">{d.category}</Badge>
                        <Badge variant={d.status === "OPEN" ? "destructive" : d.status === "RESOLVED" ? "default" : "secondary"} className="text-xs">{formatStatus(d.status)}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{d.description}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        Opened by {d.opener.displayName} · {timeAgo(d.createdAt)}
                        {d.milestone && ` · Milestone: ${d.milestone.title}`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <NewDisputeDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => { setOpen(false); load(); }}
      />
    </div>
  );
}
function NewDisputeDialog({ projectId, open, onOpenChange, onCreated }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("QUALITY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/disputes`, {
        title,
        description,
        category,
      });
      toast.success("Dispute opened", { description: `"${title}" has been filed under ${category}.` });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to open dispute", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Open dispute</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input className="input-premium" id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the issue" inputMode="text" autoCapitalize="sentences" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="QUALITY">Quality</SelectItem>
                <SelectItem value="DEADLINE">Deadline</SelectItem>
                <SelectItem value="PAYMENT">Payment</SelectItem>
                <SelectItem value="SCOPE">Scope</SelectItem>
                <SelectItem value="CONDUCT">Conduct</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description <span className="text-destructive">*</span></Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Provide factual detail. Avoid personal attacks." className="resize-y" />
            <p className="text-xs text-muted-foreground">Be factual and specific. AI dispute summary is available after opening.</p>
          </div>
          {error && <div className="text-sm text-destructive p-2 rounded-md bg-destructive/5 border border-destructive/20">{error}</div>}
        </div>
        <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
          <Button onClick={submit} disabled={loading || !title || !description} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Open dispute
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
