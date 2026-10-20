"use client";

import { useSession, signOut } from "next-auth/react";
import { useNav, type ViewName } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  FolderKanban,
  User,
  ShieldCheck,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  FileText,
  Users,
  CheckSquare,
  Wallet,
  Scale,
  Bot,
  ScrollText,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

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

const PRIMARY_NAV: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "projects", label: "Projects", icon: FolderKanban },
  { view: "notifications", label: "Notifications", icon: Bell },
];

const SETTINGS_NAV: NavItem[] = [
  { view: "settings-profile", label: "Profile", icon: User },
  { view: "settings-security", label: "Security", icon: ShieldCheck },
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
  { view: "project-disputes", label: "Disputes", icon: Scale, requiresProject: true },
  { view: "project-ai", label: "AI assistants", icon: Bot, requiresProject: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { view, navigate, projectId, goBack } = useNav();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [projectCtx, setProjectCtx] = useState<ProjectNavContext>({});
  const [isAdmin, setIsAdmin] = useState(false);

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
    const loadUnread = () => api.get<{ unreadCount: number }>("/api/notifications?limit=1").then((r) => setUnread(r.unreadCount ?? 0)).catch(() => {});
    loadUnread();
    const id = setInterval(loadUnread, 60_000);
    return () => clearInterval(id);
  }, [view]);

  // Check admin status once per session
  useEffect(() => {
    api.get<{ platformRole: string }>("/api/admin/me")
      .then(() => setIsAdmin(true))
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
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b sticky top-0 z-30 bg-background">
        <div className="flex h-16 items-center gap-3 px-4">
          <button
            className="md:hidden p-2 hover:bg-muted rounded"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate({ view: "dashboard", projectId: undefined })}
            className="flex items-center gap-2"
          >
            <img src="/images/logo.png" alt="GigSure AI" className="h-7 w-7 object-contain" />
            <span className="font-semibold hidden sm:inline">GigSure<span className="text-primary"> AI</span></span>
          </button>

          {inProject && projectCtx.projectTitle && (
            <div className="hidden md:flex items-center gap-2 ml-4 text-sm text-muted-foreground">
              <span className="truncate max-w-[200px]">{projectCtx.projectTitle}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ view: "notifications" })}
              aria-label="Notifications"
              className="relative"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted" aria-label="Account menu">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden md:block text-sm max-w-[120px] truncate">
                    {session?.user?.name ?? "User"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{session?.user?.name ?? "User"}</span>
                    <span className="text-xs text-muted-foreground font-normal truncate">{session?.user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SETTINGS_NAV.map((n) => (
                  <DropdownMenuItem key={n.view} onClick={() => navigate({ view: n.view, projectId: undefined })}>
                    <n.icon className="mr-2 h-4 w-4" /> {n.label}
                  </DropdownMenuItem>
                ))}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ view: "admin", projectId: undefined })}>
                      <ShieldAlert className="mr-2 h-4 w-4 text-primary" /> Admin dashboard
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/?view=landing" })}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          className={`fixed md:sticky top-16 left-0 z-20 h-[calc(100vh-4rem)] w-64 shrink-0 border-r bg-background overflow-y-auto transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <nav className="p-3 space-y-1">
            {PRIMARY_NAV.map((n) => (
              <SidebarLink
                key={n.view}
                active={view === n.view}
                icon={n.icon}
                label={n.label}
                onClick={() => {
                  navigate({ view: n.view, projectId: undefined });
                  setMobileOpen(false);
                }}
                badge={n.view === "notifications" && unread > 0 ? unread : undefined}
              />
            ))}

            {isAdmin && (
              <>
                <div className="pt-4 pb-1 px-2 text-xs uppercase tracking-wider text-primary flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Admin
                </div>
                <SidebarLink
                  active={view === "admin"}
                  icon={ShieldAlert}
                  label="Admin dashboard"
                  onClick={() => {
                    navigate({ view: "admin", projectId: undefined });
                    setMobileOpen(false);
                  }}
                />
              </>
            )}

            {inProject && (
              <>
                <div className="pt-4 pb-1 px-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Project
                </div>
                {PROJECT_NAV.map((n) => (
                  <SidebarLink
                    key={n.view}
                    active={view === n.view}
                    icon={n.icon}
                    label={n.label}
                    onClick={() => {
                      navigate({ view: n.view });
                      setMobileOpen(false);
                    }}
                  />
                ))}
                <div className="pt-2">
                  <Button variant="ghost" size="sm" onClick={goBack} className="w-full justify-start text-muted-foreground">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Back to projects
                  </Button>
                </div>
              </>
            )}

            <div className="pt-4 pb-1 px-2 text-xs uppercase tracking-wider text-muted-foreground">
              Account
            </div>
            {SETTINGS_NAV.map((n) => (
              <SidebarLink
                key={n.view}
                active={view === n.view}
                icon={n.icon}
                label={n.label}
                onClick={() => {
                  navigate({ view: n.view, projectId: undefined });
                  setMobileOpen(false);
                }}
              />
            ))}
          </nav>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 top-16 bg-black/30 z-10"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  active,
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className={`text-xs px-1.5 rounded-full ${active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
