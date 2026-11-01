"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { api, formatDateTime } from "@/lib/client-api";
import { Loader2, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";

type Feedback = {
  id: string;
  rating: number;
  wouldRecommend: boolean;
  onTime: number | null;
  onBudget: number | null;
  communication: number | null;
  quality: number | null;
  comment: string | null;
  createdAt: string;
  reviewer: { id: string; displayName: string };
  reviewee: { id: string; displayName: string };
};

type Member = {
  userId: string;
  role: string;
  user: { id: string; displayName: string; email: string };
};

function StarRating({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "h-3 w-3" : "h-5 w-5";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          className={`${onChange ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
          disabled={!onChange}
        >
          <Star
            className={`${starSize} ${star <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );
}

export function ProjectFeedbackView({ projectId }: { projectId: string }) {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    revieweeId: "",
    rating: 5,
    wouldRecommend: true,
    onTime: 5,
    onBudget: 5,
    communication: 5,
    quality: 5,
    comment: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ feedback: Feedback[] }>(`/api/projects/${projectId}/feedback`),
      api.get<{ members: Member[] }>(`/api/projects/${projectId}/members`).catch(() => ({ members: [] })),
    ])
      .then(([f, m]) => {
        setFeedback(f.feedback);
        setMembers(m.members ?? []);
      })
      .catch((err) => setError(err?.message ?? "Failed to load feedback"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!formState.revieweeId) return setError("Select someone to review");

    setSubmitting(true);
    try {
      await api.post(`/api/projects/${projectId}/feedback`, {
        revieweeId: formState.revieweeId,
        rating: formState.rating,
        wouldRecommend: formState.wouldRecommend,
        onTime: formState.onTime,
        onBudget: formState.onBudget,
        communication: formState.communication,
        quality: formState.quality,
        comment: formState.comment || undefined,
      });
      setSuccess("Review submitted!");
      toast.success("Review submitted", { description: "Thank you for your feedback." });
      setFormState({
        revieweeId: "",
        rating: 5,
        wouldRecommend: true,
        onTime: 5,
        onBudget: 5,
        communication: 5,
        quality: 5,
        comment: "",
      });
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
      toast.error("Failed to submit review", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSubmitting(false);
    }
  }

  const avgRating = feedback.length > 0 ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;

  if (loading) {
    return <LoadingState label="Loading feedback…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Feedback & reviews"
        description="Share your experience working with others on this project."
        icon={Star}
        actions={
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Leave a Review
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Review a team member</DialogTitle>
              <DialogDescription>
                Rate your experience working with this person. Your review helps build trust on GigSure AI.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Who are you reviewing?</Label>
                <Select value={formState.revieweeId} onValueChange={(v) => setFormState((s) => ({ ...s, revieweeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a team member" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.user.displayName} ({m.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Overall rating</Label>
                <StarRating value={formState.rating} onChange={(v) => setFormState((s) => ({ ...s, rating: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>On-time delivery</Label>
                  <StarRating value={formState.onTime} onChange={(v) => setFormState((s) => ({ ...s, onTime: v }))} size="sm" />
                </div>
                <div className="space-y-2">
                  <Label>On budget</Label>
                  <StarRating value={formState.onBudget} onChange={(v) => setFormState((s) => ({ ...s, onBudget: v }))} size="sm" />
                </div>
                <div className="space-y-2">
                  <Label>Communication</Label>
                  <StarRating value={formState.communication} onChange={(v) => setFormState((s) => ({ ...s, communication: v }))} size="sm" />
                </div>
                <div className="space-y-2">
                  <Label>Work quality</Label>
                  <StarRating value={formState.quality} onChange={(v) => setFormState((s) => ({ ...s, quality: v }))} size="sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formState.wouldRecommend}
                  onChange={(e) => setFormState((s) => ({ ...s, wouldRecommend: e.target.checked }))}
                />
                I would recommend this person
              </label>
              <div className="space-y-2">
                <Label htmlFor="comment">Comment (optional)</Label>
                <Textarea
                  id="comment"
                  value={formState.comment}
                  onChange={(e) => setFormState((s) => ({ ...s, comment: e.target.value }))}
                  placeholder="Share your experience..."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Submit Review
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        }
      />

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

      {feedback.length > 0 && (
        <Card className="premium-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-3">
              <span>Project Rating</span>
              <div className="flex items-center gap-1">
                <StarRating value={Math.round(avgRating)} size="sm" />
                <span className="text-sm text-muted-foreground ml-2">
                  {avgRating.toFixed(1)} / 5 ({feedback.length} {feedback.length === 1 ? "review" : "reviews"})
                </span>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-base">All Reviews ({feedback.length})</CardTitle>
          <CardDescription>Reviews are visible to all project members.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {feedback.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="Reviews can be submitted after at least one milestone is released."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Leave a Review
                </Button>
              }
            />
          ) : (
            <div className="divide-y">
              {feedback.map((f) => (
                <div key={f.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{f.reviewer.displayName}</span>
                        <span className="text-muted-foreground text-sm">→ reviewed →</span>
                        <span className="font-medium">{f.reviewee.displayName}</span>
                      </div>
                      <StarRating value={f.rating} size="sm" />
                      {f.comment && <p className="text-sm text-muted-foreground mt-1">{f.comment}</p>}
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        {f.onTime && <span>On-time: {f.onTime}/5</span>}
                        {f.onBudget && <span>On-budget: {f.onBudget}/5</span>}
                        {f.communication && <span>Communication: {f.communication}/5</span>}
                        {f.quality && <span>Quality: {f.quality}/5</span>}
                      </div>
                      {f.wouldRecommend && (
                        <Badge variant="default" className="text-xs badge-success">✓ Recommended</Badge>
                      )}
                      <div className="text-xs text-muted-foreground">{formatDateTime(f.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
