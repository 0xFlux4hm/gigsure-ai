"use client";

/**
 * Conversational AI task creator.
 *
 * Lives inside the existing NewTaskDialog as an alternative to the manual
 * form. The user chats with GigSure AI to describe a task; the AI either
 * asks a clarifying question or returns a structured task proposal. The
 * user reviews + edits the proposal, then clicks "Create task" — which
 * POSTs to the EXISTING /api/projects/[id]/tasks endpoint (same authz,
 * validation, audit logging, and state transitions as manual creation).
 *
 * The AI never creates a task directly. Explicit user approval is required.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types — mirror the API response shape from /api/ai/task-builder
// ---------------------------------------------------------------------------

type ChatMessage = { role: "user" | "assistant"; content: string };

type TaskProposal = {
  kind: "proposal";
  title: string;
  description: string;
  deliverables: string[];
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
  suggestedAssigneeName: string | null;
  acceptanceCriteria: string[];
  dependencies: string[];
  summary: string;
};

type TaskBuilderResponse =
  | TaskProposal
  | { kind: "clarify"; question: string }
  | { kind: "error"; message: string };

type ProjectMember = {
  id: string;
  role: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    profile: { professionalRole: string | null; headline: string | null } | null;
  };
};

// ---------------------------------------------------------------------------
// Suggested prompt chips (mobile-friendly starting points)
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  "Build a responsive login page",
  "Design a company logo",
  "Create an API for user authentication",
  "Fix the payment integration",
  "Write documentation for the project",
  "Develop an admin dashboard",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiTaskCreator({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  // Conversation thread (user + assistant turns)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Project members (for assignee resolution)
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);

  // The current structured proposal (when the AI returns one)
  const [proposal, setProposal] = useState<TaskProposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  // Editable proposal fields (when user clicks "Edit task")
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editDeliverables, setEditDeliverables] = useState("");
  const [editAcceptanceCriteria, setEditAcceptanceCriteria] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load project members (for assignee dropdown)
  useEffect(() => {
    if (membersLoaded) return;
    api
      .get<{ members: ProjectMember[] }>(`/api/projects/${projectId}/members`)
      .then((r) => {
        setMembers(r.members ?? []);
        setMembersLoaded(true);
      })
      .catch(() => {
        // Non-fatal — assignee suggestion just won't be resolvable
        setMembersLoaded(true);
      });
  }, [projectId, membersLoaded]);

  // Auto-scroll to bottom on new messages
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
      const res = await api.post<TaskBuilderResponse>("/api/ai/task-builder", {
        projectId,
        messages: nextMessages,
      });

      if (res.kind === "clarify") {
        setMessages((m) => [...m, { role: "assistant", content: res.question }]);
      } else if (res.kind === "proposal") {
        setProposal(res);
        // Pre-fill edit fields
        setEditTitle(res.title);
        setEditDescription(res.description);
        setEditPriority(res.priority);
        setEditDueDate(res.dueDate ? res.dueDate.slice(0, 10) : "");
        // Resolve suggested assignee name → member id
        const suggested = res.suggestedAssigneeName
          ? members.find((m) => m.user.displayName === res.suggestedAssigneeName)
          : null;
        setEditAssigneeId(suggested?.user.id ?? "");
        setEditDeliverables(res.deliverables.join("\n"));
        setEditAcceptanceCriteria(res.acceptanceCriteria.join("\n"));
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              res.summary ||
              `I've drafted a task: "${res.title}". Review the details below and click Create task when you're happy with it.`,
          },
        ]);
      } else {
        // error
        setMessages((m) => [...m, { role: "assistant", content: res.message }]);
      }
    } catch (err) {
      const msg = (err as Error).message ?? "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
      toast.error("AI task builder failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Create the task via the EXISTING /api/projects/[id]/tasks endpoint
  // (same authz + validation + audit logging as manual creation)
  // ---------------------------------------------------------------------------

  const createTask = async () => {
    if (!proposal && !editing) return;
    const title = editTitle.trim();
    if (title.length < 2) {
      toast.error("Title is too short", { description: "Please enter at least 2 characters." });
      return;
    }
    setCreating(true);
    try {
      await api.post(`/api/projects/${projectId}/tasks`, {
        title,
        description: editDescription,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        assigneeId: editAssigneeId || null,
      });
      toast.success("Task created", { description: `"${title}" has been added to the board.` });
      onCreated();
    } catch (err) {
      const msg = (err as Error).message ?? "Failed to create task";
      toast.error("Failed to create task", { description: msg });
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset conversation
  // ---------------------------------------------------------------------------

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
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-1">Create with AI</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Tell GigSure AI what you need to get done. I&apos;ll help organize it into a clear, actionable task.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 h-full" ref={scrollRef as never}>
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
          </ScrollArea>
        )}
      </div>

      {/* Structured task preview (when AI returns a proposal) */}
      {proposal && (
        <div className="border-t bg-muted/30 px-4 py-3 shrink-0 max-h-[45%] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">AI draft</Badge>
              {editing ? (
                <span className="text-xs text-muted-foreground">Editing — review before creating</span>
              ) : (
                <span className="text-xs text-muted-foreground">Review and approve</span>
              )}
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

          {editing ? (
            // Editable form
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-[11px]">Title</Label>
                <Input
                  className="h-8 text-sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Description</Label>
                <Textarea
                  className="text-sm min-h-[60px] resize-y"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Priority</Label>
                  <Select value={editPriority} onValueChange={(v) => setEditPriority(v as "LOW" | "MEDIUM" | "HIGH")}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Due date</Label>
                  <Input
                    className="h-8 text-sm"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>
              </div>
              {members.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Assignee</Label>
                  <Select value={editAssigneeId || "NONE"} onValueChange={(v) => setEditAssigneeId(v === "NONE" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.user.id} value={m.user.id}>
                          {m.user.displayName} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[11px]">Deliverables (one per line)</Label>
                <Textarea
                  className="text-sm min-h-[40px] resize-y"
                  value={editDeliverables}
                  onChange={(e) => setEditDeliverables(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Acceptance criteria (one per line)</Label>
                <Textarea
                  className="text-sm min-h-[40px] resize-y"
                  value={editAcceptanceCriteria}
                  onChange={(e) => setEditAcceptanceCriteria(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            // Read-only preview
            <div className="space-y-2 text-sm">
              <div className="font-medium text-base">{proposal.title}</div>
              {proposal.summary && (
                <p className="text-xs text-muted-foreground">{proposal.summary}</p>
              )}
              {proposal.description && (
                <p className="text-xs whitespace-pre-wrap">{proposal.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{proposal.priority} priority</Badge>
                {proposal.dueDate && (
                  <Badge variant="outline" className="text-[10px]">Due {proposal.dueDate.slice(0, 10)}</Badge>
                )}
                {proposal.suggestedAssigneeName && (
                  <Badge variant="outline" className="text-[10px]">@{proposal.suggestedAssigneeName}</Badge>
                )}
                {proposal.deliverables.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">{proposal.deliverables.length} deliverable(s)</Badge>
                )}
                {proposal.acceptanceCriteria.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">{proposal.acceptanceCriteria.length} criterion</Badge>
                )}
              </div>
              {proposal.deliverables.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Deliverables</div>
                  <ul className="text-xs space-y-0.5 list-disc list-inside">
                    {proposal.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
              {proposal.acceptanceCriteria.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Acceptance criteria</div>
                  <ul className="text-xs space-y-0.5 list-disc list-inside">
                    {proposal.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
              {proposal.dependencies.length > 0 && (
                <div className="pt-1">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Dependencies</div>
                  <ul className="text-xs space-y-0.5 list-disc list-inside">
                    {proposal.dependencies.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={createTask}
              disabled={creating || editTitle.trim().length < 2}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Create task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
              {editing ? "Stop editing" : "Edit task"}
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
              placeholder="Describe what you need done…"
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
