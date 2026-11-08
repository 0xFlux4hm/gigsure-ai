"use client";

/**
 * Full-page AI task creator.
 *
 * Instead of cramming the conversational AI flow into the narrow New Task
 * side sheet, this dedicated page gives the chat + task preview the full
 * screen. Better UX on both mobile and desktop.
 */
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Bot } from "lucide-react";
import { AiTaskCreator } from "@/components/ai/AiTaskCreator";
import { PageHeader } from "@/components/shared/page-components";

export function AiTaskCreatorPage({ projectId }: { projectId: string }) {
  const { navigate } = useNav();

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title="Create task with AI"
        description="Describe what you need done. GigSure AI will draft a clear, actionable task for your review."
        icon={Bot}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate({ view: "project-tasks", projectId })}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to tasks
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <div className="h-[calc(100vh-12rem)] min-h-[500px] flex flex-col">
          <AiTaskCreator
            projectId={projectId}
            onCreated={() => {
              navigate({ view: "project-tasks", projectId });
            }}
          />
        </div>
      </div>
    </div>
  );
}
