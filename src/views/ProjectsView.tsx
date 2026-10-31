"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatDate, timeAgo, formatMinor } from "@/lib/client-api";
import { FolderKanban, Plus, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Create and manage your client collaborations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New project</Button>
          </DialogTrigger>
          <NewProjectDialog onCreated={(id) => { setOpen(false); navigate({ view: "project-detail", projectId: id }); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.projects.length === 0 ? (
            <div className="text-center py-16">
              <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">No projects yet</h3>
              <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
            </div>
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
                        <Badge variant="outline" className="text-xs">{p.status}</Badge>
                        <Badge variant="secondary" className="text-xs">{p.myRole}</Badge>
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

function NewProjectDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [budget, setBudget] = useState("0");
  const [fundingArrangement, setFundingArrangement] = useState("MILESTONE");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const project = await api.post<{ id: string }>("/api/projects", {
        title,
        description,
        currency,
        budget: Number(budget) || 0,
        fundingArrangement,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      toast.success("Project created", { description: `"${title}" is ready.` });
      onCreated(project.id);
    } catch (err) {
      setError((err as Error).message);
      toast.error("Failed to create project", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create new project</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Project title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lagos Bakery Website Redesign" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description / scope</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what the client needs delivered."
            rows={4}
          />
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
            <Input id="budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
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
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={loading || !title || !description}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create project
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
