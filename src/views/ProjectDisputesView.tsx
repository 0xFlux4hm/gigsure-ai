"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDateTime, timeAgo } from "@/lib/client-api";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
          <h1 className="text-2xl font-bold">Disputes</h1>
          <p className="text-muted-foreground text-sm">Open disputes with evidence + reviewer notes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Open dispute</Button></DialogTrigger>
          <NewDisputeDialog projectId={projectId} onCreated={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {disputes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No disputes. Keep it that way.</CardContent></Card>
      ) : (
        <Card>
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
                        <Badge variant="outline" className="text-xs">{d.category}</Badge>
                        <Badge variant={d.status === "OPEN" ? "destructive" : d.status === "RESOLVED" ? "default" : "secondary"} className="text-xs">{d.status}</Badge>
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
    </div>
  );
}

function NewDisputeDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
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
    <DialogContent>
      <DialogHeader><DialogTitle>Open dispute</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the issue" />
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
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Provide factual detail. Avoid personal attacks." />
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading || !title || !description}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Open dispute
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
