"use client";

/**
 * Full-page AI project creator.
 *
 * Instead of cramming the conversational AI flow into the narrow New Project
 * side sheet, this dedicated page gives the chat + proposal preview the full
 * screen. Better UX on both mobile and desktop.
 */
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Bot } from "lucide-react";
import { AiProjectCreator } from "@/components/ai/AiProjectCreator";
import { PageHeader } from "@/components/shared/page-components";

export function AiProjectCreatorPage() {
  const { navigate } = useNav();

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title="Create project with AI"
        description="Describe what you want to build. GigSure AI will draft a complete project proposal for your review."
        icon={Bot}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate({ view: "projects" })}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to projects
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
        <div className="h-[calc(100vh-12rem)] min-h-[500px] flex flex-col">
          <AiProjectCreator
            onCreated={(projectId) => {
              navigate({ view: "project-detail", projectId });
            }}
          />
        </div>
      </div>
    </div>
  );
}
