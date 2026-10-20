"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDateTime, timeAgo } from "@/lib/client-api";
import { Send, Loader2, Scale, AlertTriangle } from "lucide-react";

type Dispute = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  opener: { id: string; displayName: string; email: string };
  milestone: { id: string; title: string } | null;
  evidence: Array<{ id: string; filename: string; contentType: string; uploadedAt: string }>;
  messages: Array<{ id: string; body: string; createdAt: string; author: { id: string; displayName: string } }>;
  reviews: Array<{ id: string; note: string | null; proposedResolution: string | null; outcome: string | null; decidedAt: string | null; reviewer: { id: string; displayName: string } }>;
};

export function ProjectDisputeDetailView({ projectId, disputeId }: { projectId: string; disputeId: string }) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [outcome, setOutcome] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [proposed, setProposed] = useState("");
  const [acting, setActing] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<Dispute>(`/api/projects/${projectId}/disputes/${disputeId}`).then(setDispute).finally(() => setLoading(false));
  };
  useEffect(load, [projectId, disputeId]);

  const postMessage = async () => {
    if (!msg.trim()) return;
    setActing(true);
    try {
      await api.post(`/api/projects/${projectId}/disputes/${disputeId}/messages`, { body: msg });
      setMsg("");
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActing(false);
    }
  };

  const submitReview = async () => {
    setActing(true);
    try {
      await api.post(`/api/projects/${projectId}/disputes/${disputeId}/reviews`, {
        note: note || undefined,
        proposedResolution: proposed || undefined,
        outcome: outcome || undefined,
      });
      setNote(""); setProposed(""); setOutcome(undefined);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!dispute) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">Dispute not found.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Scale className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">{dispute.title}</h1>
          <Badge variant="outline">{dispute.category}</Badge>
          <Badge variant={dispute.status === "OPEN" ? "destructive" : "secondary"}>{dispute.status}</Badge>
        </div>
        <p className="text-muted-foreground">{dispute.description}</p>
        <div className="text-xs text-muted-foreground mt-2">
          Opened by {dispute.opener.displayName} · {timeAgo(dispute.createdAt)}
          {dispute.milestone && ` · Milestone: ${dispute.milestone.title}`}
        </div>
      </div>

      {dispute.status === "OPEN" && dispute.milestone && (
        <Card className="border-amber-500">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <span>This dispute blocks the normal release flow for the milestone.</span>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Messages ({dispute.messages.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {dispute.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <ul className="space-y-3 max-h-[400px] overflow-y-auto">
                {dispute.messages.map((m) => (
                  <li key={m.id} className="border-l-2 pl-3">
                    <div className="text-xs text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">{m.author.displayName}</span> · {formatDateTime(m.createdAt)}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t pt-3 space-y-2">
              <Textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Add a message…"
                rows={3}
              />
              <Button size="sm" onClick={postMessage} disabled={acting || !msg.trim()}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Post message
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Evidence ({dispute.evidence.length})</CardTitle></CardHeader>
            <CardContent>
              {dispute.evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">No evidence uploaded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {dispute.evidence.map((e) => (
                    <li key={e.id} className="flex items-center justify-between">
                      <span className="truncate">{e.filename}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(e.uploadedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Reviewer notes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {dispute.reviews.length > 0 && (
                <ul className="space-y-2">
                  {dispute.reviews.map((r) => (
                    <li key={r.id} className="border-l-2 pl-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        {r.reviewer.displayName} · {formatDateTime(r.decidedAt ?? r.createdAt)}
                        {r.outcome && <Badge variant="outline" className="ml-2 text-xs">{r.outcome}</Badge>}
                      </div>
                      {r.note && <p className="text-sm">{r.note}</p>}
                      {r.proposedResolution && <p className="text-sm text-muted-foreground italic">Proposed: {r.proposedResolution}</p>}
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Record your review</div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Proposed outcome</Label>
                  <Select value={outcome ?? ""} onValueChange={setOutcome}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPHOLD_CLAIM">Uphold claim</SelectItem>
                      <SelectItem value="REJECT_CLAIM">Reject claim</SelectItem>
                      <SelectItem value="PARTIAL">Partial</SelectItem>
                      <SelectItem value="ESCALATE">Escalate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note (advisory only)" rows={2} />
                <Textarea value={proposed} onChange={(e) => setProposed(e.target.value)} placeholder="Proposed resolution" rows={2} />
                <Button size="sm" variant="outline" onClick={submitReview} disabled={acting}>
                  Submit review
                </Button>
                <p className="text-xs text-muted-foreground">
                  AI may summarize evidence but cannot make binding decisions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
