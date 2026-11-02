"use client";

/**
 * Improved New Contract Version Form.
 *
 * Replaces the old single-modal textarea form with a multi-step,
 * mobile-friendly, autosaving form that:
 *
 *   1. Uses a responsive Sheet (full-screen on mobile, side sheet on desktop)
 *      instead of a cramped modal.
 *   2. Has structured deliverable entries (add/remove rows, not a textarea).
 *   3. Uses date pickers for deadlines.
 *   4. Has a 3-step flow: Edit → Review → Submit.
 *   5. Autosaves drafts to localStorage (per project) so users don't lose
 *      work if they navigate away.
 *   6. Pre-fills from the previous version when editing.
 *   7. Offers optional AI suggestions (calls /api/ai/contract-analysis)
 *      — never silently applied, always shown for review.
 *   8. Shows a diff against the previous version before submitting.
 *
 * Preserves all 8 contract fields from the existing data model.
 * Does NOT change the backend API — same POST /api/projects/:id/contracts.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/client-api";
import {
  Plus, Loader2, Trash2, Calendar as CalendarIcon, X, Sparkles,
  CheckCircle2, FileText, AlertCircle, ChevronLeft, ChevronRight, Save,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────
type Deliverable = { id: string; text: string };

interface ContractForm {
  scopeOfWork: string;
  deliverables: Deliverable[];
  deadlines: string;
  paymentSchedule: string;
  milestoneConditions: string;
  revisionRules: string;
  cancellationTerms: string;
  disputeProcedures: string;
}

interface PreviousVersion {
  versionNumber: number;
  scopeOfWork: string;
  deliverables: string; // JSON-encoded array
  deadlines: string;
  paymentSchedule: string;
  milestoneConditions: string;
  revisionRules: string;
  cancellationTerms: string;
  disputeProcedures: string;
}

interface NewContractFormProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  previousVersion?: PreviousVersion | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const EMPTY_FORM: ContractForm = {
  scopeOfWork: "",
  deliverables: [{ id: "1", text: "" }],
  deadlines: "",
  paymentSchedule: "",
  milestoneConditions: "",
  revisionRules: "",
  cancellationTerms: "",
  disputeProcedures: "",
};

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function loadDraft(projectId: string): ContractForm | null {
  try {
    const raw = localStorage.getItem(`contract-draft:${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    return parsed.form as ContractForm;
  } catch {
    return null;
  }
}

function saveDraft(projectId: string, form: ContractForm) {
  try {
    localStorage.setItem(
      `contract-draft:${projectId}`,
      JSON.stringify({ form, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore
  }
}

function clearDraft(projectId: string) {
  try {
    localStorage.removeItem(`contract-draft:${projectId}`);
  } catch {
    // ignore
  }
}

function prefillFromPrevious(prev: PreviousVersion | null | undefined): ContractForm {
  if (!prev) return { ...EMPTY_FORM, deliverables: [{ id: genId(), text: "" }] };
  let deliverables: Deliverable[] = [{ id: genId(), text: "" }];
  try {
    const arr = JSON.parse(prev.deliverables) as string[];
    if (Array.isArray(arr) && arr.length > 0) {
      deliverables = arr.map((d) => ({ id: genId(), text: d }));
    }
  } catch {
    // keep default
  }
  return {
    scopeOfWork: prev.scopeOfWork ?? "",
    deliverables,
    deadlines: prev.deadlines ?? "",
    paymentSchedule: prev.paymentSchedule ?? "",
    milestoneConditions: prev.milestoneConditions ?? "",
    revisionRules: prev.revisionRules ?? "",
    cancellationTerms: prev.cancellationTerms ?? "",
    disputeProcedures: prev.disputeProcedures ?? "",
  };
}

// ─── Main component ──────────────────────────────────────────────────

export function NewContractForm({
  projectId, open, onOpenChange, onCreated, previousVersion,
}: NewContractFormProps) {
  const [form, setForm] = useState<ContractForm>(EMPTY_FORM);
  const [step, setStep] = useState<"edit" | "review" | "submitting">("edit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (!open) return;
    const draft = loadDraft(projectId);
    if (draft) {
      setForm(draft);
      setHasDraft(true);
      toast.info("Draft restored", {
        description: "Your unsaved draft from a previous session was restored.",
      });
    } else if (previousVersion) {
      setForm(prefillFromPrevious(previousVersion));
      setHasDraft(false);
    } else {
      setForm({ ...EMPTY_FORM, deliverables: [{ id: genId(), text: "" }] });
      setHasDraft(false);
    }
    setStep("edit");
    setError(null);
    setAiSuggestions(null);
  }, [open, projectId, previousVersion]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const hasContent = form.scopeOfWork.trim() || form.deliverables.some((d) => d.text.trim());
      if (hasContent) {
        saveDraft(projectId, form);
        setHasDraft(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [form, open, projectId]);

  const setField = useCallback((k: keyof ContractForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const addDeliverable = () => {
    setForm((f) => ({ ...f, deliverables: [...f.deliverables, { id: genId(), text: "" }] }));
  };

  const updateDeliverable = (id: string, text: string) => {
    setForm((f) => ({
      ...f,
      deliverables: f.deliverables.map((d) => (d.id === id ? { ...d, text } : d)),
    }));
  };

  const removeDeliverable = (id: string) => {
    setForm((f) => ({
      ...f,
      deliverables: f.deliverables.length > 1
        ? f.deliverables.filter((d) => d.id !== id)
        : f.deliverables,
    }));
  };

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (form.scopeOfWork.trim().length < 20) {
      errors.scopeOfWork = "Scope of work must be at least 20 characters.";
    }
    if (form.scopeOfWork.length > 20000) {
      errors.scopeOfWork = "Scope of work must be under 20,000 characters.";
    }
    const validDeliverables = form.deliverables.filter((d) => d.text.trim().length > 0);
    if (validDeliverables.length === 0) {
      errors.deliverables = "Add at least one deliverable.";
    }
    return {
      errors,
      isValid: Object.keys(errors).length === 0,
      deliverableCount: validDeliverables.length,
    };
  }, [form]);

  const getAiSuggestions = async () => {
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const contractText = `Scope of work: ${form.scopeOfWork}
Deliverables: ${form.deliverables.filter((d) => d.text).map((d) => d.text).join(", ")}
Deadlines: ${form.deadlines}
Payment schedule: ${form.paymentSchedule}
Milestone conditions: ${form.milestoneConditions}
Revision rules: ${form.revisionRules}
Cancellation terms: ${form.cancellationTerms}
Dispute procedures: ${form.disputeProcedures}`;

      const res = await api.post<{ analysis: { recommendations: string[]; flags: Array<{ clause: string; recommendation: string }> }; advisoryOnly: boolean }>(
        "/api/ai/contract-analysis",
        { contractText },
      );
      const recs = res.analysis.recommendations ?? [];
      const flagRecs = (res.analysis.flags ?? []).map((f) => `${f.clause}: ${f.recommendation}`);
      const allRecs = [...new Set([...recs, ...flagRecs])];
      setAiSuggestions(allRecs.length > 0 ? allRecs.join("\n\n") : "No specific suggestions — the contract looks complete.");
      toast.success("AI suggestions ready", { description: "Review them below — they are not applied automatically." });
    } catch (err) {
      setAiSuggestions(`Failed to get suggestions: ${(err as Error).message}`);
      toast.error("AI suggestions failed", { description: (err as Error).message });
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async () => {
    if (!validation.isValid) {
      setStep("edit");
      toast.error("Please fix the validation errors before submitting.");
      return;
    }
    setStep("submitting");
    setLoading(true);
    setError(null);
    try {
      const deliverables = form.deliverables
        .map((d) => d.text.trim())
        .filter(Boolean);
      await api.post(`/api/projects/${projectId}/contracts`, {
        scopeOfWork: form.scopeOfWork.trim(),
        deliverables,
        deadlines: form.deadlines.trim(),
        paymentSchedule: form.paymentSchedule.trim(),
        milestoneConditions: form.milestoneConditions.trim(),
        revisionRules: form.revisionRules.trim(),
        cancellationTerms: form.cancellationTerms.trim(),
        disputeProcedures: form.disputeProcedures.trim(),
      });
      clearDraft(projectId);
      setHasDraft(false);
      toast.success("Contract version created", {
        description: "The new version is now visible to project members.",
      });
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to create contract version", { description: (err as Error).message });
      setStep("review");
    } finally {
      setLoading(false);
    }
  };

  const diff = useMemo(() => {
    if (!previousVersion) return null;
    const changes: Array<{ field: string; oldVal: string; newVal: string; changed: boolean }> = [];
    const oldDeliverables = (() => {
      try { return (JSON.parse(previousVersion.deliverables) as string[]).join(", ") || "—"; }
      catch { return "—"; }
    })();
    const newDeliverables = form.deliverables.filter((d) => d.text.trim()).map((d) => d.text).join(", ") || "—";
    changes.push({ field: "Scope of work", oldVal: previousVersion.scopeOfWork || "—", newVal: form.scopeOfWork || "—", changed: previousVersion.scopeOfWork !== form.scopeOfWork });
    changes.push({ field: "Deliverables", oldVal: oldDeliverables, newVal: newDeliverables, changed: oldDeliverables !== newDeliverables });
    changes.push({ field: "Deadlines", oldVal: previousVersion.deadlines || "—", newVal: form.deadlines || "—", changed: previousVersion.deadlines !== form.deadlines });
    changes.push({ field: "Payment schedule", oldVal: previousVersion.paymentSchedule || "—", newVal: form.paymentSchedule || "—", changed: previousVersion.paymentSchedule !== form.paymentSchedule });
    changes.push({ field: "Milestone conditions", oldVal: previousVersion.milestoneConditions || "—", newVal: form.milestoneConditions || "—", changed: previousVersion.milestoneConditions !== form.milestoneConditions });
    changes.push({ field: "Revision rules", oldVal: previousVersion.revisionRules || "—", newVal: form.revisionRules || "—", changed: previousVersion.revisionRules !== form.revisionRules });
    changes.push({ field: "Cancellation terms", oldVal: previousVersion.cancellationTerms || "—", newVal: form.cancellationTerms || "—", changed: previousVersion.cancellationTerms !== form.cancellationTerms });
    changes.push({ field: "Dispute procedures", oldVal: previousVersion.disputeProcedures || "—", newVal: form.disputeProcedures || "—", changed: previousVersion.disputeProcedures !== form.disputeProcedures });
    return changes;
  }, [form, previousVersion]);

  const changedCount = diff?.filter((d) => d.changed).length ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                New Contract Version
              </SheetTitle>
              <SheetDescription className="text-xs">
                {previousVersion
                  ? `Based on Version ${previousVersion.versionNumber}. Changes require acceptance.`
                  : "Create the first contract version for this project."}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasDraft && (
                <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-500">
                  <Save className="h-2.5 w-2.5 mr-1" />
                  Draft saved
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <StepBadge active={step === "edit"} done={step !== "edit"} num={1} label="Edit" />
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <StepBadge active={step === "review"} done={step === "submitting"} num={2} label="Review" />
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <StepBadge active={step === "submitting"} done={false} num={3} label="Submit" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "edit" && (
            <EditStep
              form={form}
              setField={setField}
              addDeliverable={addDeliverable}
              updateDeliverable={updateDeliverable}
              removeDeliverable={removeDeliverable}
              validation={validation}
              aiSuggestions={aiSuggestions}
              aiLoading={aiLoading}
              onGetAiSuggestions={getAiSuggestions}
            />
          )}
          {step === "review" && (
            <ReviewStep
              form={form}
              diff={diff}
              changedCount={changedCount}
              previousVersion={previousVersion}
            />
          )}
          {step === "submitting" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Creating contract version…</p>
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
          <div className="flex items-center justify-between gap-2 w-full">
            <div>
              {step === "review" && (
                <Button variant="outline" onClick={() => setStep("edit")} disabled={loading}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to edit
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {step === "edit" && (
                <Button
                  onClick={() => {
                    if (!validation.isValid) {
                      toast.error("Please fix validation errors", {
                        description: Object.values(validation.errors).join(" "),
                      });
                      return;
                    }
                    setStep("review");
                  }}
                  disabled={!validation.isValid}
                >
                  Review
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === "review" && (
                <Button onClick={submit} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Create version
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StepBadge({ active, done, num, label }: { active: boolean; done: boolean; num: number; label: string }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors",
      active ? "bg-primary text-primary-foreground" :
      done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" :
      "bg-muted text-muted-foreground",
    )}>
      <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold">
        {done ? "✓" : num}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function EditStep({
  form, setField, addDeliverable, updateDeliverable, removeDeliverable,
  validation, aiSuggestions, aiLoading, onGetAiSuggestions,
}: {
  form: ContractForm;
  setField: (k: keyof ContractForm, v: string) => void;
  addDeliverable: () => void;
  updateDeliverable: (id: string, text: string) => void;
  removeDeliverable: (id: string) => void;
  validation: { errors: Record<string, string>; isValid: boolean; deliverableCount: number };
  aiSuggestions: string | null;
  aiLoading: boolean;
  onGetAiSuggestions: () => void;
}) {
  return (
    <div className="space-y-5">
      <FieldGroup
        label="Scope of work"
        required
        error={validation.errors.scopeOfWork}
        hint="Describe what the client wants delivered. Be specific about boundaries."
      >
        <Textarea
          value={form.scopeOfWork}
          onChange={(e) => setField("scopeOfWork", e.target.value)}
          rows={4}
          placeholder="e.g. Design and develop a 5-page responsive website for a Lagos bakery with online ordering, payment integration, and admin dashboard..."
          className="resize-y"
          inputMode="text"
          autoCapitalize="sentences"
        />
        <CharCounter value={form.scopeOfWork} min={20} max={20000} />
      </FieldGroup>

      <FieldGroup
        label="Deliverables"
        required
        error={validation.errors.deliverables}
        hint="Add each deliverable as a separate entry."
      >
        <div className="space-y-2">
          {form.deliverables.map((d, i) => (
            <div key={d.id} className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground mt-0.5">
                {i + 1}
              </div>
              <Input
                value={d.text}
                onChange={(e) => updateDeliverable(d.id, e.target.value)}
                placeholder={`Deliverable ${i + 1} (e.g. Landing page, Admin dashboard...)`}
                className="flex-1"
                inputMode="text"
                autoCapitalize="sentences"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeDeliverable(d.id)}
                disabled={form.deliverables.length === 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addDeliverable} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add deliverable
          </Button>
        </div>
      </FieldGroup>

      <FieldGroup
        label="Deadlines"
        hint="Key project deadlines. Use the date picker for specific dates."
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Add deadline date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                onSelect={(date) => {
                  if (date) {
                    const formatted = format(date, "yyyy-MM-dd");
                    setField("deadlines", form.deadlines ? `${form.deadlines}\n${formatted}` : formatted);
                  }
                }}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <Textarea
          value={form.deadlines}
          onChange={(e) => setField("deadlines", e.target.value)}
          rows={2}
          placeholder="e.g. 2026-11-15 — Design mockups due&#10;2026-11-22 — Development complete"
          className="resize-y"
        />
      </FieldGroup>

      <FieldGroup label="Payment schedule" hint="When and how the client pays.">
        <Textarea
          value={form.paymentSchedule}
          onChange={(e) => setField("paymentSchedule", e.target.value)}
          rows={2}
          placeholder="e.g. 30% upfront, 40% on milestone 2, 30% on final delivery."
          className="resize-y"
        />
      </FieldGroup>

      <FieldGroup label="Milestone conditions" hint="Conditions for each milestone to be complete.">
        <Textarea
          value={form.milestoneConditions}
          onChange={(e) => setField("milestoneConditions", e.target.value)}
          rows={2}
          placeholder="e.g. Milestone 1 complete when landing page is deployed to staging."
          className="resize-y"
        />
      </FieldGroup>

      <FieldGroup label="Revision rules" hint="How many revision rounds? What counts as a revision?">
        <Textarea
          value={form.revisionRules}
          onChange={(e) => setField("revisionRules", e.target.value)}
          rows={2}
          placeholder="e.g. 2 rounds of revisions included per deliverable."
          className="resize-y"
        />
      </FieldGroup>

      <FieldGroup label="Cancellation terms" hint="What happens if either party cancels?">
        <Textarea
          value={form.cancellationTerms}
          onChange={(e) => setField("cancellationTerms", e.target.value)}
          rows={2}
          placeholder="e.g. Either party may cancel with 7 days notice."
          className="resize-y"
        />
      </FieldGroup>

      <FieldGroup label="Dispute procedures" hint="How disputes are resolved.">
        <Textarea
          value={form.disputeProcedures}
          onChange={(e) => setField("disputeProcedures", e.target.value)}
          rows={2}
          placeholder="e.g. Parties attempt direct resolution first, then escalate to GigSure review."
          className="resize-y"
        />
      </FieldGroup>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Contract Assistant</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onGetAiSuggestions}
            disabled={aiLoading || !form.scopeOfWork}
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {aiLoading ? "Analyzing..." : "Get suggestions"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Optional. AI reviews your contract and suggests improvements. Suggestions are never applied automatically — review and edit manually.
        </p>
        {aiSuggestions && (
          <div className="mt-2 p-2 rounded-md bg-background border text-sm whitespace-pre-wrap">
            {aiSuggestions}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  form, diff, changedCount, previousVersion,
}: {
  form: ContractForm;
  diff: Array<{ field: string; oldVal: string; newVal: string; changed: boolean }> | null;
  changedCount: number;
  previousVersion?: PreviousVersion | null;
}) {
  const deliverables = form.deliverables.filter((d) => d.text.trim()).map((d) => d.text);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/30 border p-3 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-primary" />
          Contract Summary
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Deliverables: <strong className="text-foreground">{deliverables.length}</strong></div>
          <div>Has deadlines: <strong className="text-foreground">{form.deadlines ? "Yes" : "No"}</strong></div>
          <div>Has payment terms: <strong className="text-foreground">{form.paymentSchedule ? "Yes" : "No"}</strong></div>
          <div>Scope length: <strong className="text-foreground">{form.scopeOfWork.length} chars</strong></div>
        </div>
      </div>

      {previousVersion && diff && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Changes from Version {previousVersion.versionNumber}
            </div>
            <Badge variant="outline" className={cn("text-xs", changedCount > 0 ? "text-amber-700 border-amber-500" : "text-emerald-700 border-emerald-500")}>
              {changedCount > 0 ? `${changedCount} field${changedCount === 1 ? "" : "s"} changed` : "No changes"}
            </Badge>
          </div>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {diff.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md border p-2 text-xs",
                  d.changed ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" : "bg-muted/20",
                )}
              >
                <div className="font-medium text-foreground mb-1">{d.field}</div>
                {d.changed ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Previous</div>
                      <div className="text-muted-foreground line-through">{d.oldVal.slice(0, 200)}{d.oldVal.length > 200 ? "…" : ""}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase">New</div>
                      <div className="text-foreground">{d.newVal.slice(0, 200)}{d.newVal.length > 200 ? "…" : ""}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">No change</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="text-sm font-medium">Full Preview</div>
        <ReviewField label="Scope of work" value={form.scopeOfWork} />
        <ReviewField label="Deliverables" value={deliverables.length > 0 ? deliverables.map((d, i) => `${i + 1}. ${d}`).join("\n") : "—"} />
        <ReviewField label="Deadlines" value={form.deadlines || "—"} />
        <ReviewField label="Payment schedule" value={form.paymentSchedule || "—"} />
        <ReviewField label="Milestone conditions" value={form.milestoneConditions || "—"} />
        <ReviewField label="Revision rules" value={form.revisionRules || "—"} />
        <ReviewField label="Cancellation terms" value={form.cancellationTerms || "—"} />
        <ReviewField label="Dispute procedures" value={form.disputeProcedures || "—"} />
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 dark:text-amber-300">
          <strong>Important:</strong> Creating a new version does not delete or overwrite previous versions.
          Accepted terms from prior versions are preserved (marked as SUPERSEDED).
          The new version requires acceptance from project members before taking effect.
        </div>
      </div>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm whitespace-pre-wrap bg-muted/20 rounded-md p-2 border">{value}</div>
    </div>
  );
}

function FieldGroup({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function CharCounter({ value, min, max }: { value: string; min: number; max: number }) {
  const len = value.length;
  const tooShort = len < min && len > 0;
  const tooLong = len > max;
  return (
    <div className={cn(
      "text-[10px] text-right tabular-nums",
      tooShort ? "text-amber-600" : tooLong ? "text-destructive" : "text-muted-foreground",
    )}>
      {len} / {max}
      {tooShort && ` (min ${min})`}
    </div>
  );
}
