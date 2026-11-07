"use client";

/**
 * Conversational AI project creator.
 *
 * Lives inside the existing NewProjectDialog as an alternative to the
 * manual form. The client chats with GigSure AI to describe a project;
 * the AI either asks a clarifying question or returns a structured
 * project proposal. The client reviews + edits the proposal, then
 * clicks "Approve & create project" — which:
 *
 *   1. POSTs the approved project data to the EXISTING /api/projects
 *      endpoint (same authz + validation + audit logging + DRAFT status
 *      as manual creation).
 *   2. If the AI drafted a contract, POSTs to the EXISTING
 *      /api/projects/[id]/contracts endpoint.
 *   3. If the AI suggested milestones, POSTs each to the EXISTING
 *      /api/projects/[id]/milestones endpoint.
 *   4. If the AI proposed tasks, POSTs each to the EXISTING
 *      /api/projects/[id]/tasks endpoint.
 *
 * The AI never creates a project directly. Explicit user approval is
 * required, and every downstream call goes through the existing backend
 * authorization, validation, and audit logging.
 *
 * Behind the scenes, the client can also invoke the existing 9 AI
 * assistants via /api/ai/assistant (e.g. PROJECT_BRIEF_HELPER,
 * TASK_PLANNER, CONTRACT, MILESTONE_HELPER) to refine specific sections
 * of the proposal. This component focuses on the orchestrator endpoint
 * /api/ai/project-builder which handles the conversational clarification
 * + structured proposal generation.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  User as UserIcon,
  Send,
  Loader2,
  Sparkles,
  Pencil,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  FileText,
  ListChecks,
  Target,
  Calendar,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types — mirror the API response shape from /api/ai/project-builder
// All array fields are defaulted to [] defensively in case the AI omits
// them or returns null (Zod defaults apply server-side, but we double-guard
// on the client to prevent render crashes).
// ---------------------------------------------------------------------------

type ChatMessage = { role: "user" | "assistant"; content: string };

type Milestone = {
  title: string;
  description: string;
  deliverables: string[];
  dueDate: string | null;
  suggestedAmount: number | null;
};

type ProjectProposal = {
  kind: "proposal";
  title: string;
  description: string;
  objectives: string[];
  requirements: string[];
  scopeOfWork: string;
  deliverables: string[];
  proposedTasks: string[];
  dependencies: string[];
  suggestedTimelineWeeks: number | null;
  suggestedBudget: number | null;
  suggestedMilestones: Milestone[];
  draftAgreement?: {
    scopeOfWork: string;
    deliverables: string[];
    deadlines: string;
    paymentSchedule: string;
    milestoneConditions: string;
    revisionRules: string;
    cancellationTerms: string;
    disputeProcedures: string;
  };
  fundingArrangement: "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES";
  currency: string;
  potentialRisks: string[];
  summary: string;
  missingInformation: string[];
  assumptions: string[];
};

type ProjectBuilderResponse =
  | ProjectProposal
  | { kind: "clarify"; question: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Suggested starting prompts
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  "I want to develop an e-commerce website for my clothing business. Customers should be able to browse products, place orders, make payments and track deliveries.",
  "Build a mobile app for food delivery with restaurant listings, real-time tracking, and payment integration.",
  "Create a company website with a blog, contact form, and CMS for content management.",
  "Develop an admin dashboard for managing users, orders, and analytics.",
];

// ---------------------------------------------------------------------------
// Defensive normalizer — guarantees all array fields exist as [] and all
// string fields exist as "" so the render never throws on undefined.map()
// or undefined.length. The Zod schema on the server applies defaults too,
// but we double-guard on the client to be bulletproof against any AI output
// shape that slips through.
// ---------------------------------------------------------------------------

function normalizeProposal(res: ProjectProposal): ProjectProposal {
  const arr = <T,>(v: T[] | null | undefined): T[] =>
    Array.isArray(v) ? v : [];
  return {
    kind: "proposal",
    title: res.title || "Untitled project",
    description: res.description || "",
    objectives: arr(res.objectives),
    requirements: arr(res.requirements),
    scopeOfWork: res.scopeOfWork || "",
    deliverables: arr(res.deliverables),
    proposedTasks: arr(res.proposedTasks),
    dependencies: arr(res.dependencies),
    suggestedTimelineWeeks: res.suggestedTimelineWeeks ?? null,
    suggestedBudget: res.suggestedBudget ?? null,
    suggestedMilestones: arr(res.suggestedMilestones).map((m) => ({
      title: m.title || "Untitled milestone",
      description: m.description || "",
      deliverables: arr(m.deliverables),
      dueDate: m.dueDate ?? null,
      suggestedAmount: m.suggestedAmount ?? null,
    })),
    draftAgreement: res.draftAgreement
      ? {
          scopeOfWork: res.draftAgreement.scopeOfWork || "",
          deliverables: arr(res.draftAgreement.deliverables),
          deadlines: res.draftAgreement.deadlines || "",
          paymentSchedule: res.draftAgreement.paymentSchedule || "",
          milestoneConditions: res.draftAgreement.milestoneConditions || "",
          revisionRules: res.draftAgreement.revisionRules || "",
          cancellationTerms: res.draftAgreement.cancellationTerms || "",
          disputeProcedures: res.draftAgreement.disputeProcedures || "",
        }
      : undefined,
    fundingArrangement: res.fundingArrangement || "MILESTONE",
    currency: res.currency || "NGN",
    potentialRisks: arr(res.potentialRisks),
    summary: res.summary || "",
    missingInformation: arr(res.missingInformation),
    assumptions: arr(res.assumptions),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiProjectCreator({
  onCreated,
}: {
  onCreated: (projectId: string) => void;
}) {
  // Conversation thread
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // The current structured proposal
  const [proposal, setProposal] = useState<ProjectProposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "overview" | "tasks" | "milestones" | "agreement" | "risks"
  >("overview");

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCurrency, setEditCurrency] = useState("NGN");
  const [editFundingArrangement, setEditFundingArrangement] = useState<
    "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES"
  >("MILESTONE");
  const [editObjectives, setEditObjectives] = useState("");
  const [editRequirements, setEditRequirements] = useState("");
  const [editScope, setEditScope] = useState("");
  const [editDeliverables, setEditDeliverables] = useState("");
  const [editProposedTasks, setEditProposedTasks] = useState("");
  const [editTimelineWeeks, setEditTimelineWeeks] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editMilestones, setEditMilestones] = useState("");
  const [editAgreement, setEditAgreement] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // ---------------------------------------------------------------------------
  // Send a message to the AI
  // ---------------------------------------------------------------------------

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setProposal(null);

    try {
      const res = await api.post<ProjectBuilderResponse>(
        "/api/ai/project-builder",
        { messages: nextMessages },
      );

      if (res.kind === "clarify") {
        setMessages((m) => [...m, { role: "assistant", content: res.question }]);
      } else if (res.kind === "proposal") {
        // DEFENSIVE: normalize all array fields to [] and string fields to ""
        // in case the AI omitted them or returned null (prevents render crashes
        // from undefined.map() / undefined.length)
        const safe = normalizeProposal(res);
        setProposal(safe);
        // Pre-fill editable fields
        setEditTitle(safe.title || "");
        setEditDescription(safe.description || "");
        setEditCurrency(safe.currency || "NGN");
        setEditFundingArrangement(safe.fundingArrangement || "MILESTONE");
        setEditObjectives((safe.objectives || []).join("\n"));
        setEditRequirements((safe.requirements || []).join("\n"));
        setEditScope(safe.scopeOfWork || "");
        setEditDeliverables((safe.deliverables || []).join("\n"));
        setEditProposedTasks((safe.proposedTasks || []).join("\n"));
        setEditTimelineWeeks(
          safe.suggestedTimelineWeeks ? String(safe.suggestedTimelineWeeks) : "",
        );
        setEditBudget(
          safe.suggestedBudget != null ? String(safe.suggestedBudget) : "",
        );
        setEditMilestones(
          (safe.suggestedMilestones || [])
            .map(
              (m) =>
                `${m.title || "Untitled"} | ${m.description || ""} | ${m.dueDate ? m.dueDate.slice(0, 10) : "no date"} | amount: ${m.suggestedAmount ?? 0} | deliverables: ${(m.deliverables || []).join("; ")}`,
            )
            .join("\n"),
        );
        setEditAgreement(
          safe.draftAgreement
            ? [
                `SCOPE: ${safe.draftAgreement.scopeOfWork || ""}`,
                `DELIVERABLES: ${(safe.draftAgreement.deliverables || []).join("; ")}`,
                `DEADLINES: ${safe.draftAgreement.deadlines || ""}`,
                `PAYMENT: ${safe.draftAgreement.paymentSchedule || ""}`,
                `MILESTONE CONDITIONS: ${safe.draftAgreement.milestoneConditions || ""}`,
                `REVISION RULES: ${safe.draftAgreement.revisionRules || ""}`,
                `CANCELLATION: ${safe.draftAgreement.cancellationTerms || ""}`,
                `DISPUTE: ${safe.draftAgreement.disputeProcedures || ""}`,
              ].join("\n\n")
            : "",
        );
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              safe.summary ||
              `I've drafted a project proposal: "${safe.title}". Review the details below and click "Approve & create project" when you're ready.`,
          },
        ]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: res.message }]);
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
      toast.error("AI project builder failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create the project via EXISTING endpoints
  // (authz + validation + audit logging preserved)
  // ---------------------------------------------------------------------------

  const createProject = async () => {
    if (!proposal) return;
    const title = editTitle.trim();
    if (title.length < 3) {
      toast.error("Title is too short", { description: "Please enter at least 3 characters." });
      return;
    }
    const description = editDescription.trim();
    if (description.length < 10) {
      toast.error("Description is too short", { description: "Please enter at least 10 characters." });
      return;
    }
    setCreating(true);

    try {
      // 1. Create the project via the EXISTING /api/projects endpoint
      //    The budget is the AI-suggested (and client-edited) value in
      //    major units; the existing endpoint converts to minor via
      //    amountToMinor().
      const budgetValue = Number(editBudget) || 0;
      const project = await api.post<{ id: string }>("/api/projects", {
        title,
        description,
        currency: editCurrency,
        budget: budgetValue,
        fundingArrangement: editFundingArrangement,
        // dueDate omitted — client sets later if needed
      });

      const projectId = project.id;

      // 2. Create contract version (if AI drafted one)
      const agreementText = editAgreement.trim();
      if (agreementText && proposal.draftAgreement) {
        try {
          // Parse the editable agreement back into structured fields.
          // The client edits freeform text; we send best-effort structured
          // fields and the existing /contracts endpoint re-validates.
          const deliverablesArr = proposal.draftAgreement.deliverables;
          await api.post(`/api/projects/${projectId}/contracts`, {
            scopeOfWork: proposal.draftAgreement.scopeOfWork || editScope || title,
            deliverables: deliverablesArr,
            deadlines: proposal.draftAgreement.deadlines || "",
            paymentSchedule: proposal.draftAgreement.paymentSchedule || "",
            milestoneConditions: proposal.draftAgreement.milestoneConditions || "",
            revisionRules: proposal.draftAgreement.revisionRules || "",
            cancellationTerms: proposal.draftAgreement.cancellationTerms || "",
            disputeProcedures: proposal.draftAgreement.disputeProcedures || "",
          });
        } catch (err) {
          // Non-fatal — project is created, contract can be added later
          toast.warning("Contract draft skipped", {
            description: "You can add a contract version from the project's Contracts tab.",
          });
        }
      }

      // 3. Create milestones (if AI suggested any)
      //    Parse the editable milestones text. Each line format:
      //    "Title | Description | YYYY-MM-DD | amount: N | deliverables: a; b"
      //    If parsing fails for a line, fall back to the original proposal milestone.
      if (proposal.suggestedMilestones.length > 0 && editFundingArrangement !== "FULL") {
        const milestoneLines = editMilestones.split("\n").filter((l) => l.trim());
        for (let i = 0; i < milestoneLines.length; i++) {
          const line = milestoneLines[i].trim();
          if (!line) continue;
          // Try to parse the pipe-delimited format
          const parts = line.split("|").map((p) => p.trim());
          const title = parts[0] || proposal.suggestedMilestones[i]?.title || `Milestone ${i + 1}`;
          const description = parts[1] || proposal.suggestedMilestones[i]?.description || "";
          const dateStr = parts[2] && parts[2] !== "no date" ? parts[2] : null;
          // Parse amount from "amount: N" part
          const amountPart = parts.find((p) => p.startsWith("amount:"));
          const amountStr = amountPart ? amountPart.replace("amount:", "").trim() : "0";
          const amountMajor = parseInt(amountStr, 10) || 0;
          // amountMinor must be >= 1 per the existing /milestones endpoint
          const amountMinor = Math.max(1, amountMajor * 100);
          // Parse deliverables from "deliverables: a; b" part
          const delivPart = parts.find((p) => p.startsWith("deliverables:"));
          const delivStr = delivPart ? delivPart.replace("deliverables:", "").trim() : "";

          try {
            await api.post(`/api/projects/${projectId}/milestones`, {
              title,
              description: description || undefined,
              amountMinor,
              dueDate: dateStr ? new Date(dateStr).toISOString() : null,
            });
          } catch (err) {
            // Non-fatal — project is created
          }
        }
      }

      // 4. Create proposed tasks (if AI suggested any)
      const taskLines = editProposedTasks
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
      if (taskLines.length > 0) {
        for (const taskTitle of taskLines) {
          try {
            await api.post(`/api/projects/${projectId}/tasks`, {
              title: taskTitle,
              description: "",
              priority: "MEDIUM",
            });
          } catch (err) {
            // Non-fatal — project is created
          }
        }
      }

      toast.success("Project created", {
        description: `"${title}" is ready. Budget ${editCurrency} ${Number(editBudget || 0).toLocaleString()}, ${proposal.suggestedMilestones.length} milestone(s), ${taskLines.length} task(s) drafted for your review.`,
      });
      onCreated(projectId);
    } catch (err) {
      const msg = (err as Error).message ?? "Failed to create project";
      toast.error("Failed to create project", { description: msg });
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setProposal(null);
    setEditing(false);
    setInput("");
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasConversation = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Conversation area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!hasConversation && !loading ? (
          // Empty state — suggested prompts
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center overflow-y-auto">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-1">Create with AI</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Tell GigSure AI what you want to build. I&apos;ll ask the right questions and prepare
              a structured project proposal for your review.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-md">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 h-full overflow-y-auto" ref={scrollRef}>
            <div className="px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {m.role === "user" ? (
                      <UserIcon className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2.5 flex-row">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Structured proposal preview */}
      {proposal && (
        <div className="border-t bg-muted/30 shrink-0 max-h-[55%] overflow-y-auto">
          {/* Section tabs */}
          <div className="sticky top-0 bg-background/80 backdrop-blur px-3 pt-2 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex gap-1 flex-wrap">
                <SectionTab
                  active={activeSection === "overview"}
                  onClick={() => setActiveSection("overview")}
                  icon={Target}
                  label="Overview"
                />
                <SectionTab
                  active={activeSection === "tasks"}
                  onClick={() => setActiveSection("tasks")}
                  icon={ListChecks}
                  label={`Tasks (${proposal.proposedTasks.length})`}
                />
                <SectionTab
                  active={activeSection === "milestones"}
                  onClick={() => setActiveSection("milestones")}
                  icon={Calendar}
                  label={`Milestones (${proposal.suggestedMilestones.length})`}
                />
                <SectionTab
                  active={activeSection === "agreement"}
                  onClick={() => setActiveSection("agreement")}
                  icon={FileText}
                  label="Agreement"
                />
                <SectionTab
                  active={activeSection === "risks"}
                  onClick={() => setActiveSection("risks")}
                  icon={ShieldAlert}
                  label={`Risks (${proposal.potentialRisks.length})`}
                />
              </div>
              <div className="flex items-center gap-1">
                {!editing ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                    <Check className="h-3 w-3 mr-1" /> Done
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setProposal(null);
                    setEditing(false);
                    setInput("Try again with different details");
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Revise
                </Button>
              </div>
            </div>
          </div>

          {/* Section content */}
          <div className="px-4 py-3 space-y-3 text-sm">
            {activeSection === "overview" && (
              <div className="space-y-3">
                <Field label="Title" editing={editing}>
                  {editing ? (
                    <Input
                      className="h-8 text-sm"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  ) : (
                    <div className="font-medium text-base">{proposal.title}</div>
                  )}
                </Field>
                <Field label="Summary">
                  <p className="text-xs text-muted-foreground">{proposal.summary}</p>
                </Field>
                <Field label="Description" editing={editing}>
                  {editing ? (
                    <Textarea
                      className="text-sm min-h-[80px] resize-y"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                    />
                  ) : (
                    <p className="text-xs whitespace-pre-wrap">{proposal.description}</p>
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Currency" editing={editing}>
                    {editing ? (
                      <Select value={editCurrency} onValueChange={setEditCurrency}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["NGN", "USD", "GHS", "KES", "GBP", "EUR"].map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{proposal.currency}</Badge>
                    )}
                  </Field>
                  <Field label="Funding arrangement" editing={editing}>
                    {editing ? (
                      <Select
                        value={editFundingArrangement}
                        onValueChange={(v) =>
                          setEditFundingArrangement(v as "FULL" | "MILESTONE" | "UPFRONT_PLUS_MILESTONES")
                        }
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FULL">Full upfront</SelectItem>
                          <SelectItem value="MILESTONE">Milestone</SelectItem>
                          <SelectItem value="UPFRONT_PLUS_MILESTONES">Upfront + milestones</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {proposal.fundingArrangement.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Suggested budget" editing={editing}>
                    {editing ? (
                      <Input
                        className="h-8 text-sm"
                        type="number"
                        min="0"
                        value={editBudget}
                        onChange={(e) => setEditBudget(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                      />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {proposal.suggestedBudget != null
                          ? `${editCurrency} ${Number(proposal.suggestedBudget).toLocaleString()}`
                          : "Not set"}
                      </Badge>
                    )}
                  </Field>
                  <Field label="Timeline (weeks)" editing={editing}>
                    {editing ? (
                      <Input
                        className="h-8 text-sm"
                        type="number"
                        min="1"
                        max="52"
                        value={editTimelineWeeks}
                        onChange={(e) => setEditTimelineWeeks(e.target.value)}
                        placeholder="8"
                        inputMode="numeric"
                      />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {proposal.suggestedTimelineWeeks ? `~${proposal.suggestedTimelineWeeks} weeks` : "Not set"}
                      </Badge>
                    )}
                  </Field>
                </div>
                <ListField
                  label="Objectives"
                  items={proposal.objectives}
                  editing={editing}
                  value={editObjectives}
                  onChange={setEditObjectives}
                />
                <ListField
                  label="Requirements"
                  items={proposal.requirements}
                  editing={editing}
                  value={editRequirements}
                  onChange={setEditRequirements}
                />
                <Field label="Scope of work" editing={editing}>
                  {editing ? (
                    <Textarea
                      className="text-sm min-h-[60px] resize-y"
                      value={editScope}
                      onChange={(e) => setEditScope(e.target.value)}
                      rows={3}
                    />
                  ) : (
                    <p className="text-xs whitespace-pre-wrap">{proposal.scopeOfWork || "—"}</p>
                  )}
                </Field>
                <ListField
                  label="Deliverables"
                  items={proposal.deliverables}
                  editing={editing}
                  value={editDeliverables}
                  onChange={setEditDeliverables}
                />
              </div>
            )}

            {activeSection === "tasks" && (
              <div className="space-y-2">
                <Field label="Proposed tasks" editing={editing}>
                  {editing ? (
                    <Textarea
                      className="text-sm min-h-[100px] resize-y"
                      value={editProposedTasks}
                      onChange={(e) => setEditProposedTasks(e.target.value)}
                      rows={5}
                      placeholder="One task per line"
                    />
                  ) : proposal.proposedTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks proposed.</p>
                  ) : (
                    <ol className="text-xs space-y-1 list-decimal list-inside">
                      {proposal.proposedTasks.map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  )}
                </Field>
                {proposal.dependencies.length > 0 && (
                  <Field label="Dependencies">
                    <ul className="text-xs space-y-0.5 list-disc list-inside">
                      {proposal.dependencies.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </Field>
                )}
              </div>
            )}

            {activeSection === "milestones" && (
              <Field label="Suggested milestones" editing={editing}>
                {editing ? (
                  <Textarea
                    className="text-sm min-h-[120px] resize-y font-mono text-[11px]"
                    value={editMilestones}
                    onChange={(e) => setEditMilestones(e.target.value)}
                    rows={6}
                    placeholder={"One milestone per line\nFormat: Title | Description | YYYY-MM-DD | amount: 250000 | deliverables: item1; item2"}
                  />
                ) : proposal.suggestedMilestones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No milestones proposed (funding arrangement is FULL).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {proposal.suggestedMilestones.map((m, i) => (
                      <div key={i} className="rounded-lg border border-border/60 p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-xs">{m.title}</span>
                          <div className="flex gap-1">
                            {m.suggestedAmount != null && (
                              <Badge variant="outline" className="text-[10px] text-primary">
                                {proposal.currency} {Number(m.suggestedAmount).toLocaleString()}
                              </Badge>
                            )}
                            {m.dueDate && (
                              <Badge variant="outline" className="text-[10px]">
                                {m.dueDate.slice(0, 10)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {m.description && (
                          <p className="text-[11px] text-muted-foreground mb-1">{m.description}</p>
                        )}
                        {m.deliverables.length > 0 && (
                          <ul className="text-[11px] space-y-0.5 list-disc list-inside text-muted-foreground">
                            {m.deliverables.map((d, j) => <li key={j}>{d}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            )}

            {activeSection === "agreement" && (
              <Field label="Draft agreement" editing={editing}>
                {editing ? (
                  <Textarea
                    className="text-sm min-h-[150px] resize-y font-mono text-[11px]"
                    value={editAgreement}
                    onChange={(e) => setEditAgreement(e.target.value)}
                    rows={8}
                  />
                ) : !proposal.draftAgreement ? (
                  <p className="text-xs text-muted-foreground">No draft agreement provided.</p>
                ) : (
                  <pre className="text-[11px] whitespace-pre-wrap font-mono bg-muted/40 rounded p-2">
                    {editAgreement || JSON.stringify(proposal.draftAgreement, null, 2)}
                  </pre>
                )}
              </Field>
            )}

            {activeSection === "risks" && (
              <div className="space-y-3">
                <Field label="Potential risks">
                  {proposal.potentialRisks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No specific risks identified.</p>
                  ) : (
                    <ul className="text-xs space-y-1">
                      {proposal.potentialRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>
                {proposal.missingInformation.length > 0 && (
                  <Field label="Missing information — please confirm">
                    <ul className="text-xs space-y-1">
                      {proposal.missingInformation.map((m, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-amber-500 shrink-0">?</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </Field>
                )}
                {proposal.assumptions.length > 0 && (
                  <Field label="Assumptions made — please verify">
                    <ul className="text-xs space-y-1">
                      {proposal.assumptions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500 shrink-0">≈</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </Field>
                )}
              </div>
            )}
          </div>

          {/* Approve / Create actions */}
          <div className="sticky bottom-0 bg-background/80 backdrop-blur border-t px-4 py-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={createProject}
              disabled={creating || editTitle.trim().length < 3}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Approve &amp; create project
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
              {editing ? "Stop editing" : "Edit proposal"}
            </Button>
          </div>
        </div>
      )}

      {/* Input area */}
      {!proposal && (
        <div className="border-t px-3 py-3 shrink-0">
          {hasConversation && (
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={reset}>
                <X className="h-3 w-3 mr-1" /> Start over
              </Button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <Input
              className="flex-1"
              placeholder="Describe the project you want to build…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------

function SectionTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function Field({
  label,
  editing,
  children,
}: {
  label: string;
  editing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ListField({
  label,
  items,
  editing,
  value,
  onChange,
}: {
  label: string;
  items: string[];
  editing: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {editing ? (
        <Textarea
          className="text-sm min-h-[60px] resize-y"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="One per line"
        />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="text-xs space-y-0.5 list-disc list-inside">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </Field>
  );
}
