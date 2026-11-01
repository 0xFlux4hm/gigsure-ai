"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { Bot, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-components";

const ASSISTANTS = [
  { key: "TEAM_PLANNER", name: "Team Planner", desc: "Suggest roles and collaboration structures" },
  { key: "TASK_PLANNER", name: "Task Planner", desc: "Break scope into tasks, dependencies, deadlines" },
  { key: "CONTRACT", name: "Contract Assistant", desc: "Explain clauses, flag ambiguous terms" },
  { key: "FUNDING", name: "Funding Assistant", desc: "Explain recorded funding states and prerequisites" },
  { key: "RISK", name: "Project Risk Assistant", desc: "Identify overdue work, unclear responsibilities" },
  { key: "EVIDENCE", name: "Evidence Assistant", desc: "Summarize dispute evidence and timelines" },
  { key: "PROGRESS", name: "Progress Assistant", desc: "Summarize project progress from records" },
] as const;

type AssistantKey = typeof ASSISTANTS[number]["key"];

export function ProjectAiView({ projectId }: { projectId: string }) {
  const [active, setActive] = useState<AssistantKey>("TEAM_PLANNER");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await api.post<{
        response: string;
        fallbackUsed: boolean;
        advisoryOnly: boolean;
        name: string;
      }>("/api/ai/assistant", {
        assistant: active,
        prompt,
        projectId,
      });
      setResponse(res.response);
      setFallbackUsed(res.fallbackUsed);
      toast.success("Assistant response ready", { description: res.fallbackUsed ? "Generated using fallback (deterministic)." : "Generated successfully." });
    } catch (err) {
      setError((err as Error).message);
      toast.error("Assistant run failed", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI assistants"
        description="Advisory only. AI cannot authorize payments or make binding decisions."
        icon={Bot}
      />

      <Card>
        <CardContent className="p-4 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border-amber-500">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Advisory only.</strong> AI output is informational. It does
            not authorize financial transfers, override authorization, or make
            binding legal decisions. All recommendations pass normal
            business-rule validation before being applied.
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          {ASSISTANTS.map((a) => (
            <button
              key={a.key}
              onClick={() => { setActive(a.key); setResponse(null); setError(null); }}
              className={`w-full text-left p-3 rounded border transition-colors ${
                active === a.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              <div className="font-medium text-sm">{a.name}</div>
              <div className={`text-xs ${active === a.key ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {a.desc}
              </div>
            </button>
          ))}
        </div>

        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {ASSISTANTS.find((a) => a.key === active)?.name}
              </CardTitle>
              <CardDescription>{ASSISTANTS.find((a) => a.key === active)?.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want the assistant to analyze…"
                rows={4}
              />
              <Button onClick={submit} disabled={loading || !prompt.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Run assistant
              </Button>
            </CardContent>
          </Card>

          {error && (
            <Card><CardContent className="p-3 text-sm text-destructive">{error}</CardContent></Card>
          )}

          {response && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Response</span>
                  {fallbackUsed && <Badge variant="outline" className="text-xs text-amber-700 border-amber-500">Fallback (deterministic)</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap">{response}</div>
                <div className="mt-3 text-xs text-muted-foreground border-t pt-2">
                  AI-generated. Advisory only. Verify before acting.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
