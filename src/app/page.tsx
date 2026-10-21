"use client";

import { useEffect, useState, useCallback } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { useNav } from "@/lib/nav";
import { LandingView } from "@/views/LandingView";
import { AuthViews } from "@/views/AuthViews";
import { AppShell } from "@/views/AppShell";
import { DashboardView } from "@/views/DashboardView";
import { ProjectsView } from "@/views/ProjectsView";
import { ProjectDetailView } from "@/views/ProjectDetailView";
import { ProjectContractsView } from "@/views/ProjectContractsView";
import { ProjectTeamView } from "@/views/ProjectTeamView";
import { ProjectTasksView } from "@/views/ProjectTasksView";
import { ProjectCompensationView } from "@/views/ProjectCompensationView";
import { ProjectMilestonesView } from "@/views/ProjectMilestonesView";
import { ProjectFundingView } from "@/views/ProjectFundingView";
import { ProjectDisputesView } from "@/views/ProjectDisputesView";
import { ProjectDisputeDetailView } from "@/views/ProjectDisputeDetailView";
import { ProjectAiView } from "@/views/ProjectAiView";
import { SettingsProfileView } from "@/views/SettingsProfileView";
import { SettingsSecurityView } from "@/views/SettingsSecurityView";
import { SettingsNotificationsView } from "@/views/SettingsNotificationsView";
import { SettingsPrivacyView } from "@/views/SettingsPrivacyView";
import { SettingsAuditView } from "@/views/SettingsAuditView";
import { NotificationsView } from "@/views/NotificationsView";
import { InvitationView } from "@/views/InvitationView";
import { AdminView } from "@/views/AdminView";
import { KycView } from "@/views/KycView";

function Router() {
  const { data: session, status } = useSession();
  const { view, projectId, disputeId, token, navigate } = useNav();

  // Public views
  if (view === "landing") return <LandingView />;

  // Auth views
  if (["login", "register", "verify-email", "forgot-password", "reset-password"].includes(view)) {
    return <AuthViews />;
  }

  // Invitation view (requires auth to accept)
  if (view === "invitation") return <InvitationView token={token} />;

  // Loading state while session is being fetched
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!session) {
    if (typeof window !== "undefined") {
      // Reset to landing so we don't bounce back here after sign-in
      navigate({ view: "login" });
    }
    return null;
  }

  // Authenticated views — wrap in AppShell
  return (
    <AppShell>
      {view === "dashboard" && <DashboardView />}
      {view === "projects" && <ProjectsView />}
      {view === "project-detail" && projectId && <ProjectDetailView projectId={projectId} />}
      {view === "project-contracts" && projectId && <ProjectContractsView projectId={projectId} />}
      {view === "project-team" && projectId && <ProjectTeamView projectId={projectId} />}
      {view === "project-tasks" && projectId && <ProjectTasksView projectId={projectId} />}
      {view === "project-compensation" && projectId && <ProjectCompensationView projectId={projectId} />}
      {view === "project-milestones" && projectId && <ProjectMilestonesView projectId={projectId} />}
      {view === "project-funding" && projectId && <ProjectFundingView projectId={projectId} />}
      {view === "project-disputes" && projectId && <ProjectDisputesView projectId={projectId} />}
      {view === "project-dispute-detail" && projectId && disputeId && (
        <ProjectDisputeDetailView projectId={projectId} disputeId={disputeId} />
      )}
      {view === "project-ai" && projectId && <ProjectAiView projectId={projectId} />}
      {view === "settings-profile" && <SettingsProfileView />}
      {view === "settings-security" && <SettingsSecurityView />}
      {view === "settings-notifications" && <SettingsNotificationsView />}
      {view === "settings-privacy" && <SettingsPrivacyView />}
      {view === "settings-audit" && <SettingsAuditView />}
      {view === "notifications" && <NotificationsView />}
      {view === "admin" && <AdminView />}
      {view === "kyc" && <KycView />}
    </AppShell>
  );
}

export default function Home() {
  // Listen for popstate so the URL ↔ state sync stays correct.
  useEffect(() => {
    const onPop = () => useNav.getState().navigate({});
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <SessionProvider>
      <Router />
    </SessionProvider>
  );
}
