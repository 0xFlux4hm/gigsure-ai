"use client";

import { useSession, signOut } from "next-auth/react";
import { useNav, type ViewName } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  FolderKanban,
  User,
  ShieldCheck,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  FileText,
  Users,
  CheckSquare,
  Wallet,
  Scale,
  Bot,
  ScrollText,
  Lock,
  ShieldAlert,
  Receipt,
  Star,
  X,
  MoreHorizontal,
  Home,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { VerifiedBadge } from "@/components/VerifiedBadge";

type ProjectNavContext = {
  projectId?: string;
  projectTitle?: string;
};

interface NavItem {
  view: ViewName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresProject?: boolean;
}

// Primary nav — shown as bottom tab bar on mobile, icon rail on desktop
const PRIMARY_NAV: NavItem[] = [
  { view: "dashboard", label: "Home", icon: Home },
  { view: "projects", label: "Projects", icon: FolderKanban },
  { view: "project-ai", label: "AI", icon: Bot, requiresProject: true },
  { view: "notifications", label: "Inbox", icon: Bell },
];

const SETTINGS_NAV: NavItem[] = [
  { view: "settings-profile", label: "Profile", icon: User },
  { view: "settings-security", label: "Security", icon: ShieldCheck },
  { view: "settings-payouts", label: "Payouts", icon: Wallet },
  { view: "settings-notifications", label: "Notifications", icon: Bell },
  { view: "settings-privacy", label: "Privacy", icon: Lock },
  { view: "settings-audit", label: "Audit log", icon: ScrollText },
];

const PROJECT_NAV: NavItem[] = [
  { view: "project-detail", label: "Overview", icon: FolderKanban, requiresProject: true },
  { view: "project-contracts", label: "Contracts", icon: FileText, requiresProject: true },
  { view: "project-team", label: "Team", icon: Users, requiresProject: true },
  { view: "project-tasks", label: "Tasks", icon: CheckSquare, requiresProject: true },
  { view: "project-compensation", label: "Compensation", icon: Wallet, requiresProject: true },
  { view: "project-milestones", label: "Milestones", icon: CheckSquare, requiresProject: true },
  { view: "project-funding", label: "Funding", icon: Wallet, requiresProject: true },
  { view: "project-expenses", label: "Expenses", icon: Receipt, requiresProject: true },
  { view: "project-disputes", label: "Disputes", icon: Scale, requiresProject: true },
  { view: "project-feedback", label: "Feedback", icon: Star, requiresProject: true },
  { view: "project-ai", label: "AI assistants", icon: Bot, requiresProject: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { view, navigate, projectId, goBack } = useNav();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [projectCtx, setProjectCtx] = useState<ProjectNavContext>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [kycVerified, setKycVerified] = useState(false);

  useEffect(() => {
    if (projectId) {
      api.get<{ id: string; title: string }>(`/api/projects/${projectId}`)
        .then((p) => setProjectCtx({ projectId: p.id, projectTitle: p.title }))
        .catch(() => setProjectCtx({ projectId }));
    } else {
      setProjectCtx({});
    }
  }, [projectId]);

  useEffect(() => {
    api.get<{ kyc?: { verified?: boolean } }>("/api/me")
      .then((u) => setKycVerified(u.kyc?.verified ?? false))
      .catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    const loadUnread = () => api.get<{ unreadCount: number }>("/api/notifications?limit=1").then((r) => setUnread(r.unreadCount ?? 0)).catch(() => {});
    loadUnread();
    const id = setInterval(loadUnread, 60_000);
    return () => clearInterval(id);
  }, [view]);

  useEffect(() => {
    api.get<{ platformRole?: string }>("/api/me")
      .then((u) => setIsAdmin(u.platformRole === "ADMIN"))
      .catch(() => setIsAdmin(false));
  }, [session?.user?.id]);

  const inProject = PROJECT_NAV.some((n) => n.view === view);

  const initials = (session?.user?.name ?? session?.user?.email ?? "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Slim top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => navigate({ view: "dashboard", projectId: undefined })}
            className="flex items-center gap-2.5 shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm">
              G
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">GigSure<span className="text-primary"> AI</span></span>
          </button>

          {/* Project context (shown when inside a project) */}
          {inProject && projectCtx.projectTitle && (
            <div className="hidden sm:flex items-center gap-2 ml-2 pl-4 border-l border-border/60 min-w-0">
              <span className="text-sm text-muted-foreground truncate max-w-[180px]">{projectCtx.projectTitle}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ view: "notifications" })}
              aria-label="Notifications"
              className="relative h-9 w-9 rounded-lg hover:bg-muted lg:hidden"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold shadow-sm">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Button>
            <button
              onClick={() => setMoreOpen(true)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8 ring-2 ring-border/50">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden md:flex items-center gap-1 text-sm max-w-[120px] truncate">
                {session?.user?.name ?? "User"}
                {kycVerified && <VerifiedBadge size="sm" showLabel={false} />}
              </span>
            </button>
          </div>
        </div>

        {/* Project sub-nav — horizontal scrollable strip (mobile + desktop) */}
        {inProject && (
          <div className="border-t border-border/40 bg-muted/20">
            <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto scrollbar-thin">
              <button
                onClick={() => { goBack(); }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Projects</span>
              </button>
              <div className="h-4 w-px bg-border/60 shrink-0" />
              {PROJECT_NAV.map((n) => (
                <button
                  key={n.view}
                  onClick={() => navigate({ view: n.view })}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    view === n.view
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <n.icon className="h-3.5 w-3.5" />
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop icon sidebar (lg+) */}
        <aside className="hidden lg:flex sticky top-[3.5rem] h-[calc(100vh-3.5rem)] w-16 shrink-0 flex-col items-center bg-sidebar/50 backdrop-blur-sm border-r border-border/60 py-3 gap-1.5">
          {PRIMARY_NAV.map((n) => {
            const showAi = n.view === "project-ai" && !inProject;
            if (showAi) return null;
            const target: Partial<{ view: ViewName; projectId?: string }> =
              n.view === "project-ai"
                ? (projectId ? { view: n.view, projectId } : { view: "projects" as ViewName })
                : { view: n.view, projectId: undefined };
            return (
              <IconRailButton
                key={n.view}
                icon={n.icon}
                label={n.label}
                active={view === n.view}
                onClick={() => navigate(target)}
                badge={n.view === "notifications" && unread > 0 ? unread : undefined}
              />
            );
          })}

          {/* Admin (if applicable) */}
          {isAdmin && (
            <IconRailButton
              icon={ShieldAlert}
              label="Admin"
              active={view === "admin"}
              onClick={() => navigate({ view: "admin", projectId: undefined })}
            />
          )}

          <div className="flex-1" />

          {/* More / Settings */}
          <IconRailButton
            icon={Settings}
            label="Settings"
            active={SETTINGS_NAV.some((s) => s.view === view)}
            onClick={() => setMoreOpen(true)}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-16 lg:pb-0">
          <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8 page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/60">
        <div className="flex items-center justify-around h-14 px-1">
          {PRIMARY_NAV.map((n) => {
            const isAiTab = n.view === "project-ai";
            // AI tab: if no project context, route to Projects (so user picks/creates a project first)
            const target = isAiTab && !inProject
              ? { view: "projects" as ViewName, projectId: undefined }
              : isAiTab && projectId
              ? { view: n.view, projectId }
              : { view: n.view, projectId: undefined };
            const isActive = isAiTab
              ? (view === n.view || (view === "project-ai" && inProject))
              : view === n.view;
            return (
              <button
                key={n.view}
                onClick={() => navigate(target)}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors relative ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-[20px] w-[20px]" />
                <span className="text-[10px] font-medium">{n.label}</span>
                {n.view === "notifications" && unread > 0 && (
                  <span className="absolute top-1.5 right-1/2 translate-x-3 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-semibold">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
          {/* More tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors ${
              SETTINGS_NAV.some((s) => s.view === view) || view === "admin" || view === "kyc"
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <MoreHorizontal className="h-[20px] w-[20px]" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* More sheet (settings + admin + KYC + sign out) */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="p-0 max-h-[80vh] overflow-y-auto sm:max-w-md sm:mx-auto sm:rounded-t-2xl">
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">Menu</SheetTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMoreOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          <div className="p-3 space-y-1">
            {/* User info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 mb-2">
              <Avatar className="h-10 w-10 ring-2 ring-border/50">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate flex items-center gap-1">
                  {session?.user?.name ?? "User"}
                  {kycVerified && <VerifiedBadge size="sm" showLabel={false} />}
                </div>
                <div className="text-xs text-muted-foreground truncate">{session?.user?.email}</div>
              </div>
            </div>

            {/* KYC */}
            {!kycVerified && (
              <>
                <MoreLink
                  icon={ShieldCheck}
                  label="Verify identity (KYC)"
                  onClick={() => { navigate({ view: "kyc", projectId: undefined }); setMoreOpen(false); }}
                  accent="amber"
                />
                <div className="h-px bg-border/60 my-2" />
              </>
            )}

            {/* Admin */}
            {isAdmin && (
              <>
                <MoreLink
                  icon={ShieldAlert}
                  label="Admin dashboard"
                  onClick={() => { navigate({ view: "admin", projectId: undefined }); setMoreOpen(false); }}
                  accent="primary"
                />
                <div className="h-px bg-border/60 my-2" />
              </>
            )}

            {/* Settings */}
            <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Settings
            </div>
            {SETTINGS_NAV.map((n) => (
              <MoreLink
                key={n.view}
                icon={n.icon}
                label={n.label}
                active={view === n.view}
                onClick={() => { navigate({ view: n.view, projectId: undefined }); setMoreOpen(false); }}
              />
            ))}

            <div className="h-px bg-border/60 my-2" />

            {/* Sign out */}
            <MoreLink
              icon={LogOut}
              label="Sign out"
              onClick={() => signOut({ callbackUrl: "/?view=landing" })}
              accent="destructive"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon rail button (desktop sidebar)
// ---------------------------------------------------------------------------

function IconRailButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group relative h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-150 shrink-0 ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      {badge !== undefined && (
        <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-semibold">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {/* Hover tooltip */}
      <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-700 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
      {active && (
        <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// More link (mobile bottom sheet)
// ---------------------------------------------------------------------------

function MoreLink({
  icon: Icon,
  label,
  active,
  onClick,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  accent?: "default" | "primary" | "amber" | "destructive";
}) {
  const accentClasses = {
    default: active ? "bg-primary/10 text-primary" : "hover:bg-muted",
    primary: "text-primary hover:bg-primary/10",
    amber: "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
    destructive: "text-destructive hover:bg-destructive/10",
  };
  const iconAccent = {
    default: active ? "text-primary" : "text-muted-foreground",
    primary: "text-primary",
    amber: "text-amber-600 dark:text-amber-400",
    destructive: "text-destructive",
  };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${accentClasses[accent ?? "default"]}`}
    >
      <Icon className={`h-[18px] w-[18px] ${iconAccent[accent ?? "default"]}`} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
