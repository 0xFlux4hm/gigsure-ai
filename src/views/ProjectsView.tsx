"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDate, timeAgo, formatMinor } from "@/lib/client-api";
import { FolderKanban, Plus, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";

type Project = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  currency: string;
  budgetMinor: number;
  fundingArrangement: string;
  myRole: string;
  updatedAt: string;
  dueDate: string | null;
  _count: { tasks: number; milestones: number; disputes: number; memberships: number };
};

type ProjectsData = { projects: Project[] };

export function ProjectsView() {
  const { navigate } = useNav();
  const [data, setData] = useState<ProjectsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<ProjectsData>("/api/projects?limit=100").then(setData).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Projects"
        description="Create and manage your client collaborations."
        icon={FolderKanban}
        actions={
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> New project</Button>
        }
      />

      <NewProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => { setOpen(false); navigate({ view: "project-detail", projectId: id }); }}
      />

      <Card className="premium-card">
        <CardContent className="p-0">
          {loading ? (
            <LoadingState label="Loading projects…" />
          ) : data?.projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to get started."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New project
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {data?.projects.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => navigate({ view: "project-detail", projectId: p.id })}
                    className="w-full text-left p-4 flex items-start gap-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold truncate">{p.title}</h3>
                        <Badge variant="outline" className="text-xs badge-info">{p.status}</Badge>
                        <Badge variant="secondary" className="text-xs badge-warning">{p.myRole}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{p.description}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{p._count.memberships} members</span>
                        <span>{p._count.tasks} tasks</span>
                        <span>{p._count.milestones} milestones</span>
                        {p._count.disputes > 0 && <span className="text-destructive">{p._count.disputes} disputes</span>}
                        <span>· Updated {timeAgo(p.updatedAt)}</span>
                        {p.dueDate && <span>· Due {formatDate(p.dueDate)}</span>}
                      </div>
                    </div>
                    {p.budgetMinor > 0 && (
                      <div className="text-right text-sm hidden sm:block shrink-0">
                        <div className="font-medium">{formatMinor(p.budgetMinor, p.currency)}</div>
                        <div className="text-xs text-muted-foreground">budget</div>
                      </div>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [budget, setBudget] = useState("0");
  const [fundingArrangement, setFundingArrangement] = useState("MILESTONE");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleValid = title.trim().length >= 3 && title.trim().length <= 160;
  const descriptionValid = description.trim().length >= 10 && description.trim().length <= 8000;
  const canSubmit = titleValid && descriptionValid && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const project = await api.post<{ id: string }>("/api/projects", {
        title: title.trim(),
        description: description.trim(),
        currency,
        budget: Number(budget) || 0,
        fundingArrangement,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      toast.success("Project created", { description: `"${title}" is ready.` });
      onCreated(project.id);
    } catch (err) {
      const msg = (err as Error).message || "";
      const friendly = msg.includes("Invalid project data")
        ? "Title must be at least 3 characters and description at least 10 characters."
        : msg;
      setError(friendly);
      toast.error("Failed to create project", { description: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Create new project</SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Project title <span className="text-destructive">*</span></Label>
            <Input className="input-premium" id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lagos Bakery Website Redesign" inputMode="text" autoCapitalize="sentences" />
            {title.trim().length > 0 && !titleValid && (
              <p className="text-xs text-destructive">Title must be at least 3 characters.</p>
            )}
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">{title.length} / 160</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description / scope <span className="text-destructive">*</span></Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what the client needs delivered. Include scope, target users, and key features."
              rows={4}
              className="resize-y"
            />
            {description.trim().length > 0 && !descriptionValid && (
              <p className="text-xs text-destructive">Description must be at least 10 characters.</p>
            )}
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">{description.length} / 8000</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="GHS">GHS — Ghanaian Cedi</SelectItem>
                  <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                  <SelectItem value="GBP">GBP — Pound Sterling</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget (major units)</Label>
              <Input className="input-premium" id="budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" inputMode="decimal" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="funding">Funding arrangement</Label>
              <Select value={fundingArrangement} onValueChange={setFundingArrangement}>
                <SelectTrigger id="funding"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full funding</SelectItem>
                  <SelectItem value="MILESTONE">Milestone-based</SelectItem>
                  <SelectItem value="UPFRONT_PLUS_MILESTONES">Upfront + milestones</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Due date</Label>
              <Input className="input-premium" id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {error && (
            <div className="text-sm text-destructive p-2 rounded-md bg-destructive/5 border border-destructive/20">{error}</div>
          )}
        </div>
        <SheetFooter className="px-6 py-3 border-t bg-background shrink-0">
          <Button onClick={submit} disabled={!canSubmit} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create project
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
