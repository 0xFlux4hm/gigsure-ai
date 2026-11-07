"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { X, Bot } from "lucide-react";
import { api, formatDate } from "@/lib/client-api";
import { useNav } from "@/lib/nav";
import { Plus, Loader2, ChevronDown, ChevronRight, Upload, Download, Trash2, Paperclip, CheckSquare } from "lucide-react";

import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, formatStatus } from "@/components/shared/page-components";
type Deliverable = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  submittedAt: string;
  submitter: { id: string; displayName: string };
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: { id: string; displayName: string } | null;
  milestone: { id: string; title: string } | null;
  deliverables: Deliverable[];
};

const COLUMNS = [
  { key: "TODO", label: "To do" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "CHANGES_REQUESTED", label: "Changes requested" },
  { key: "APPROVED", label: "Approved" },
];

const NEXT_STATUS: Record<string, { label: string; value: string }[]> = {
  TODO: [{ label: "Start", value: "IN_PROGRESS" }],
  IN_PROGRESS: [{ label: "Submit", value: "SUBMITTED" }],
  SUBMITTED: [{ label: "Approve", value: "APPROVED" }, { label: "Request changes", value: "CHANGES_REQUESTED" }],
  CHANGES_REQUESTED: [{ label: "Re-submit", value: "SUBMITTED" }],
  APPROVED: [],
};

export function ProjectTasksView({ projectId }: { projectId: string }) {
  const { navigate } = useNav();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    api.get<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`).then((r) => setTasks(r.tasks)).finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const transition = async (taskId: string, status: string) => {
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${taskId}`, { status });
      const statusMessages: Record<string, { title: string; desc: string }> = {
        IN_PROGRESS: { title: "Task started", desc: "Task is now in progress." },
        SUBMITTED: { title: "Task submitted", desc: "Sent for review." },
        APPROVED: { title: "Task approved", desc: "Task marked complete." },
        CHANGES_REQUESTED: { title: "Changes requested", desc: "Reviewer requested revisions." },
      };
      const msg = statusMessages[status] ?? { title: "Task updated", desc: "Status has been changed." };
      toast.success(msg.title, { description: msg.desc });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const uploadDeliverable = async (taskId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/deliverables`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Upload failed");
      }
      toast.success("Deliverable uploaded", { description: file.name });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteDeliverable = async (taskId: string, deliverableId: string) => {
    if (!confirm("Delete this deliverable?")) return;
    try {
      await api.del(`/api/projects/${projectId}/tasks/${taskId}/deliverables/${deliverableId}`);
      toast.success("Deliverable deleted", { description: "The file has been removed." });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const downloadDeliverable = (taskId: string, deliverableId: string, filename: string) => {
    window.open(`/api/projects/${projectId}/tasks/${taskId}/deliverables/${deliverableId}`, "_blank");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <LoadingState label="Loading tasks…" />;
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Tasks"
        description="Drag to reorder. Status updates are server-validated."
        icon={CheckSquare}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ view: "ai-task-create", projectId })}>
              <Bot className="mr-2 h-4 w-4" /> Create with AI
            </Button>
            <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> New task</Button>
          </div>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          description="Create a task to start tracking work on this project."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New task
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{col.label}</span>
                  <Badge variant="secondary" className="text-xs badge-warning">{colTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => (
                    <Card className="premium-card" key={t.id}>
                      <CardContent className="p-3">
                        <button
                          onClick={() => toggleExpand(t.id)}
                          className="w-full text-left flex items-start gap-1"
                        >
                          {expanded.has(t.id) ? <ChevronDown className="h-3 w-3 mt-1 shrink-0" /> : <ChevronRight className="h-3 w-3 mt-1 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{t.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {t.assignee?.displayName ?? "Unassigned"}
                              {t.dueDate && ` · ${formatDate(t.dueDate)}`}
                            </div>
                            {t.milestone && (
                              <Badge variant="outline" className="text-[10px] mt-1 badge-info">{t.milestone.title}</Badge>
                            )}
                          </div>
                        </button>
                        {expanded.has(t.id) && (
                          <div className="mt-2 pt-2 border-t text-xs space-y-2">
                            {t.description && <p className="text-muted-foreground">{t.description}</p>}
                            {t.deliverables.length > 0 && (
                              <div>
                                <div className="text-muted-foreground mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Deliverables:</div>
                                <ul className="space-y-1">
                                  {t.deliverables.map((d) => (
                                    <li key={d.id} className="flex items-center gap-2">
                                      <button
                                        onClick={() => downloadDeliverable(t.id, d.id, d.filename)}
                                        className="text-primary hover:underline flex items-center gap-1 truncate"
                                      >
                                        <Download className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{d.filename}</span>
                                      </button>
                                      <span className="text-muted-foreground text-[10px] shrink-0">{formatFileSize(d.sizeBytes)}</span>
                                      <Badge variant="outline" className="text-[10px] shrink-0 badge-info">{formatStatus(d.status)}</Badge>
                                      <button
                                        onClick={() => deleteDeliverable(t.id, d.id)}
                                        className="text-destructive hover:text-destructive/80 shrink-0"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* Upload button */}
                            <label className="inline-flex items-center gap-1 cursor-pointer text-primary hover:underline">
                              <Upload className="h-3 w-3" />
                              <span>Upload deliverable</span>
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) uploadDeliverable(t.id, file);
                                  e.target.value = "";
                                }}
                                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.json,.csv,.txt"
                              />
                            </label>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] badge-info">{t.priority}</Badge>
                              {(NEXT_STATUS[t.status] ?? []).map((next) => (
                                <Button
                                  key={next.value}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs"
                                  onClick={() => transition(t.id, next.value)}
                                >
                                  {next.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded">No tasks</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewTaskDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => { setOpen(false); load(); }}
      />
    </div>
  );
}

function NewTaskDialog({ projectId, open, onOpenChange, onCreated }: { projectId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/tasks`, {
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      toast.success("Task created", { description: `"${title}" has been added to the board.` });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to create task", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>New task</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="space-y-1.5">
                <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
                <Input className="input-premium" id="title" value={title} onChange={(e) => setTitle(e.target.value)} inputMode="text" autoCapitalize="sentences" placeholder="e.g. Implement login page" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="resize-y" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="due">Due date</Label>
                  <Input className="input-premium" id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              {error && <div className="text-sm text-destructive p-2 rounded-md bg-destructive/5 border border-destructive/20">{error}</div>}
            </div>
            <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
              <Button onClick={submit} disabled={loading || !title} className="w-full sm:w-auto">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create task
              </Button>
            </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
