"use client";

/**
 * Shared AI feature UI components for GigSure's 5 AI capabilities.
 *
 * Each component:
 *   - Calls the corresponding /api/ai/* route
 *   - Shows loading + error + result states
 *   - Makes AI-generated content EDITABLE before saving (never auto-binds)
 *   - Shows clear "AI-generated. Advisory only." labeling
 *   - Falls back gracefully on rate limits / provider errors
 *
 * Used by:
 *   - ProjectAiView (the 4 generators are linked from there)
 *   - ContractRiskAnalyzer (uses <ContractAnalysisPanel/>)
 *   - ProjectDetailView (can launch any of the 4 from project tabs)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, FileText,
  ListChecks, Scale, ShieldAlert, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types matching the API responses ────────────────────────────────
type ProjectBrief = {
  title: string;
  overview: string;
  scopeOfWork: string;
  deliverables: string[];
  skillsRequired: string[];
  complexity: "LOW" | "MEDIUM" | "HIGH";
  clarifyingQuestions: string[];
  estimatedTimelineWeeks: number;
};

type MilestoneSuggestion = {
  title: string;
  description: string;
  deliverables: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  estimatedDays: number;
  suggestedPaymentPercent: number;
};

type MilestonePlan = {
  milestones: MilestoneSuggestion[];
  totalWeeks: number;
  fundingArrangement: "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES";
  notes: string;
};

type ContractAnalysis = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  flags: Array<{
    category: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    clause: string;
    reason: string;
    recommendation: string;
  }>;
  missingInformation: string[];
  summary: string;
  recommendations: string[];
};

type DisputeSummary = {
  timeline: Array<{ date: string; event: string; party: string }>;
  agreedDeliverables: string[];
  submittedWork: string[];
  gaps: string[];
  keyClaims: Array<{ party: string; claim: string }>;
  clarifyingQuestions: string[];
  summary: string;
  recommendedNextSteps: string[];
};

// ─── Shared AI Advisory Banner ───────────────────────────────────────
function AdvisoryBanner() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div>
        <strong>AI-generated. Advisory only.</strong> Edit before saving. AI cannot
        authorize payments, release funds, or make binding decisions.
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "LOW" | "MEDIUM" | "HIGH" }) {
  const cls = severity === "HIGH" ? "badge-danger" : severity === "MEDIUM" ? "badge-warning" : "badge-success";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{severity}</Badge>;
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE A: Project Brief Generator
// ═══════════════════════════════════════════════════════════════════
export function ProjectBriefGenerator({ onApply }: { onApply?: (brief: ProjectBrief) => void }) {
  const [description, setDescription] = useState("");
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (description.trim().length < 20) {
      toast.error("Description too short", { description: "Please enter at least 20 characters." });
      return;
    }
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const res = await api.post<{ brief: ProjectBrief; advisoryOnly: boolean }>("/api/ai/project-brief", {
        description,
      });
      setBrief(res.brief);
      toast.success("Project brief generated", { description: "Review and edit before saving." });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error("Brief generation failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => {
    setBrief(null);
    generate();
  };

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Project Brief Generator
        </CardTitle>
        <CardDescription>
          Describe your project in plain language. AI suggests a structured brief you can edit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="brief-desc">Project description</Label>
          <Textarea
            id="brief-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. I need a website for my Lagos bakery. Customers should be able to see the menu, place orders online, and pay with card or transfer. I want it to look modern and load fast on mobile."
            rows={5}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">{description.length} / 8000 characters</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={generate} disabled={loading || description.trim().length < 20}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate brief
          </Button>
          {brief && (
            <Button variant="outline" onClick={regenerate} disabled={loading}>
              <RotateCcw className="h-3 w-3 mr-1" /> Regenerate
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/5 border border-destructive/20">
            {error}
          </div>
        )}

        {brief && (
          <div className="space-y-4 pt-2 border-t">
            <AdvisoryBanner />
            <div className="space-y-1.5">
              <Label htmlFor="brief-title">Project title</Label>
              <Input
                id="brief-title"
                value={brief.title}
                onChange={(e) => setBrief({ ...brief, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-overview">Overview</Label>
              <Textarea
                id="brief-overview"
                value={brief.overview}
                onChange={(e) => setBrief({ ...brief, overview: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-scope">Scope of work</Label>
              <Textarea
                id="brief-scope"
                value={brief.scopeOfWork}
                onChange={(e) => setBrief({ ...brief, scopeOfWork: e.target.value })}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Complexity</Label>
                <Select
                  value={brief.complexity}
                  onValueChange={(v) => setBrief({ ...brief, complexity: v as ProjectBrief["complexity"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">LOW — simple/routine</SelectItem>
                    <SelectItem value="MEDIUM">MEDIUM — standard work</SelectItem>
                    <SelectItem value="HIGH">HIGH — novel/hard/risky</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-weeks">Timeline (weeks)</Label>
                <Input
                  id="brief-weeks"
                  type="number"
                  min={1}
                  max={52}
                  value={brief.estimatedTimelineWeeks}
                  onChange={(e) => setBrief({ ...brief, estimatedTimelineWeeks: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Deliverables</Label>
              <ul className="space-y-1 text-sm">
                {brief.deliverables.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label>Skills required</Label>
              <div className="flex flex-wrap gap-1">
                {brief.skillsRequired.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
            {brief.clarifyingQuestions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Questions for you to clarify
                </Label>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {brief.clarifyingQuestions.map((q, i) => (
                    <li key={i} className="list-disc list-inside">{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {onApply && (
              <Button onClick={() => onApply(brief)} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Use this brief
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE B: Milestone Generator
// ═══════════════════════════════════════════════════════════════════
export function MilestoneGenerator({
  projectId,
  projectTitle,
  scopeOfWork,
  fundingArrangement,
  onApply,
}: {
  projectId: string;
  projectTitle: string;
  scopeOfWork: string;
  fundingArrangement: "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES";
  onApply?: (plan: MilestonePlan) => void;
}) {
  const [plan, setPlan] = useState<MilestonePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await api.post<{ plan: MilestonePlan; advisoryOnly: boolean }>("/api/ai/milestones", {
        projectId,
        projectTitle,
        scopeOfWork,
        fundingArrangement,
      });
      setPlan(res.plan);
      toast.success("Milestone plan generated", { description: `${res.plan.milestones.length} milestones suggested.` });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error("Milestone plan failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          AI Milestone Generator
        </CardTitle>
        <CardDescription>
          Suggests a milestone breakdown for <strong>{fundingArrangement}</strong> funding.
          Edit before saving — never auto-approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
          <div><strong>Project:</strong> {projectTitle}</div>
          <div><strong>Funding:</strong> {fundingArrangement}</div>
          <div className="mt-1 line-clamp-2"><strong>Scope:</strong> {scopeOfWork.slice(0, 200)}{scopeOfWork.length > 200 ? "…" : ""}</div>
        </div>

        <Button onClick={generate} disabled={loading || scopeOfWork.length < 20}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate milestones
        </Button>

        {error && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/5 border border-destructive/20">
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-3 pt-2 border-t">
            <AdvisoryBanner />
            {plan.notes && (
              <div className="text-xs text-muted-foreground italic">{plan.notes}</div>
            )}
            <div className="text-xs text-muted-foreground">
              Total: <strong>{plan.totalWeeks} weeks</strong> · {plan.milestones.length} milestones
            </div>
            {plan.milestones.map((m, i) => (
              <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
                      {m.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{m.suggestedPaymentPercent}%</div>
                    <div className="text-[10px] text-muted-foreground">of budget</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="font-medium text-muted-foreground">Deliverables:</div>
                    <ul className="list-disc list-inside">
                      {m.deliverables.map((d, j) => <li key={j}>{d}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="font-medium text-muted-foreground">Acceptance criteria:</div>
                    <ul className="list-disc list-inside">
                      {m.acceptanceCriteria.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>⏱ {m.estimatedDays} days</span>
                  {m.dependencies.length > 0 && (
                    <span>Depends on: {m.dependencies.join(", ")}</span>
                  )}
                </div>
              </div>
            ))}
            {onApply && (
              <Button onClick={() => onApply(plan)} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Use this milestone plan
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE C: Contract Analysis (Enhanced — supersedes contract-risk)
// ═══════════════════════════════════════════════════════════════════
export function ContractAnalysisPanel({
  contractVersionId,
  contractText,
}: {
  contractVersionId?: string;
  contractText?: string;
}) {
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const body: Record<string, string> = {};
      if (contractVersionId) body.contractVersionId = contractVersionId;
      if (contractText) body.contractText = contractText;
      const res = await api.post<{ analysis: ContractAnalysis; advisoryOnly: boolean }>(
        "/api/ai/contract-analysis",
        body,
      );
      setAnalysis(res.analysis);
      toast.success("Contract analysis ready", { description: `Risk score: ${res.analysis.score}/100 (${res.analysis.riskLevel})` });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error("Analysis failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          AI Contract Analysis
        </CardTitle>
        <CardDescription>
          Identifies missing info, ambiguous obligations, payment inconsistencies, and conflicting clauses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={analyze} disabled={loading || (!contractVersionId && !contractText)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Analyze contract
        </Button>

        {error && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/5 border border-destructive/20">
            {error}
          </div>
        )}

        {analysis && (
          <div className="space-y-4 pt-2 border-t">
            <AdvisoryBanner />

            {/* Risk score gauge */}
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${
                analysis.riskLevel === "HIGH" ? "text-red-600 dark:text-red-400"
                : analysis.riskLevel === "MEDIUM" ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
              }`}>
                {analysis.score}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Risk score (0-100)</div>
                <SeverityBadge severity={analysis.riskLevel} />
              </div>
            </div>

            <p className="text-sm">{analysis.summary}</p>

            {analysis.flags.length > 0 && (
              <div className="space-y-2">
                <Label>Flagged issues ({analysis.flags.length})</Label>
                {analysis.flags.map((f, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium flex items-center gap-2">
                        <SeverityBadge severity={f.severity} />
                        {f.clause}
                      </div>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{f.category.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="text-muted-foreground">{f.reason}</div>
                    <div className="text-xs">
                      <strong className="text-emerald-700 dark:text-emerald-400">Recommendation:</strong> {f.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {analysis.missingInformation.length > 0 && (
              <div className="space-y-1.5">
                <Label>Missing information</Label>
                <ul className="text-sm space-y-1">
                  {analysis.missingInformation.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <Label>Recommendations</Label>
                <ul className="text-sm space-y-1">
                  {analysis.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-2 flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Informational only — not legal advice. Consult a Nigerian-qualified lawyer for binding interpretation.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE E: Dispute Summary (Neutral)
// ═══════════════════════════════════════════════════════════════════
export function DisputeSummaryPanel({ disputeId }: { disputeId: string }) {
  const [summary, setSummary] = useState<DisputeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const res = await api.post<{ summary: DisputeSummary; advisoryOnly: boolean }>(
        "/api/ai/dispute-summary",
        { disputeId },
      );
      setSummary(res.summary);
      toast.success("Dispute summary ready", { description: "Neutral summary — review with both parties." });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error("Summary generation failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          AI Dispute Summary
        </CardTitle>
        <CardDescription>
          Neutral summary of the dispute using authorized records. Documentation only — never decides outcomes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate neutral summary
        </Button>

        {error && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/5 border border-destructive/20">
            {error}
          </div>
        )}

        {summary && (
          <div className="space-y-4 pt-2 border-t">
            <AdvisoryBanner />

            <p className="text-sm">{summary.summary}</p>

            {summary.timeline.length > 0 && (
              <div className="space-y-1.5">
                <Label>Timeline ({summary.timeline.length} events)</Label>
                <ol className="text-sm space-y-1 border-l-2 border-muted pl-3">
                  {summary.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <div className="absolute -left-[18px] top-1 h-2 w-2 rounded-full bg-primary" />
                      <div className="text-xs text-muted-foreground">{t.date} · {t.party}</div>
                      <div>{t.event}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {summary.agreedDeliverables.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Agreed deliverables</Label>
                  <ul className="text-xs space-y-1">
                    {summary.agreedDeliverables.map((d, i) => <li key={i} className="list-disc list-inside">{d}</li>)}
                  </ul>
                </div>
              )}
              {summary.submittedWork.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Submitted work</Label>
                  <ul className="text-xs space-y-1">
                    {summary.submittedWork.map((d, i) => <li key={i} className="list-disc list-inside">{d}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {summary.gaps.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Gaps ({summary.gaps.length})
                </Label>
                <ul className="text-sm space-y-1">
                  {summary.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-1" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.keyClaims.length > 0 && (
              <div className="space-y-1.5">
                <Label>Key claims (both sides)</Label>
                <ul className="text-sm space-y-1">
                  {summary.keyClaims.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0">{c.party}</Badge>
                      <span>{c.claim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.clarifyingQuestions.length > 0 && (
              <div className="space-y-1.5">
                <Label>Questions to clarify</Label>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {summary.clarifyingQuestions.map((q, i) => (
                    <li key={i} className="list-disc list-inside">{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {summary.recommendedNextSteps.length > 0 && (
              <div className="space-y-1.5">
                <Label>Suggested next steps (administrative only)</Label>
                <ul className="text-sm space-y-1">
                  {summary.recommendedNextSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-amber-800 dark:text-amber-400 border-t pt-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3" />
              AI cannot release funds, freeze accounts, or decide disputes. Human review is mandatory.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
