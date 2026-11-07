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
  Receipt,
  Star,
  X,
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

const PRIMARY_NAV: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "projects", label: "Projects", icon: FolderKanban },
  { view: "notifications", label: "Notifications", icon: Bell },
  { view: "kyc", label: "Verify Identity", icon: ShieldCheck },
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate({ view: "dashboard", projectId: undefined })}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm">
              G
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">GigSure<span className="text-primary"> AI</span></span>
          </button>

          {inProject && projectCtx.projectTitle && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-4 border-l border-border/60">
              <span className="text-sm text-muted-foreground truncate max-w-[180px]">{projectCtx.projectTitle}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ view: "notifications" })}
              aria-label="Notifications"
              className="relative h-9 w-9 rounded-lg hover:bg-muted"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold shadow-sm">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Account menu">
                  <Avatar className="h-8 w-8 ring-2 ring-border/50">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden md:flex items-center gap-1 text-sm max-w-[120px] truncate">
                    {session?.user?.name ?? "User"}
                    {kycVerified && <VerifiedBadge size="sm" showLabel={false} />}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/60 shadow-lg">
                <DropdownMenuLabel className="py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{session?.user?.name ?? "User"}</span>
                    <span className="text-xs text-muted-foreground truncate">{session?.user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SETTINGS_NAV.map((n) => (
                  <DropdownMenuItem key={n.view} onClick={() => navigate({ view: n.view, projectId: undefined })} className="rounded-md gap-2.5 py-1.5">
                    <n.icon className="h-4 w-4 text-muted-foreground" /> {n.label}
                  </DropdownMenuItem>
                ))}
                {!kycVerified && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ view: "kyc", projectId: undefined })} className="rounded-md gap-2.5 py-1.5">
                      <ShieldCheck className="h-4 w-4 text-amber-600" /> Complete KYC Verification
                    </DropdownMenuItem>
                  </>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ view: "admin", projectId: undefined })} className="rounded-md gap-2.5 py-1.5">
                      <ShieldAlert className="h-4 w-4 text-primary" /> Admin dashboard
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/?view=landing" })}
                  className="rounded-md gap-2.5 py-1.5 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex sticky top-14 h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar/50 backdrop-blur-sm">
          <SidebarContent
            view={view}
            navigate={navigate}
            goBack={goBack}
            inProject={inProject}
            isAdmin={isAdmin}
            unread={unread}
            setMobileOpen={setMobileOpen}
            projectCtx={projectCtx}
          />
        </aside>

        {/* Mobile sidebar */}
        {mobileOpen && (
          <>
            <div className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="lg:hidden fixed left-0 top-0 z-50 h-full w-72 bg-background border-r border-border/60 shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-4 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">G</div>
                  <span className="font-semibold">GigSure<span className="text-primary"> AI</span></span>
                </div>
                <button onClick={() => setMobileOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto h-[calc(100%-57px)]">
                <SidebarContent
                  view={view}
                  navigate={navigate}
                  goBack={goBack}
                  inProject={inProject}
                  isAdmin={isAdmin}
                  unread={unread}
                  setMobileOpen={setMobileOpen}
                  projectCtx={projectCtx}
                />
              </div>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8 page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  view,
  navigate,
  goBack,
  inProject,
  isAdmin,
  unread,
  setMobileOpen,
  projectCtx,
}: {
  view: ViewName;
  navigate: (s: Partial<{ view: ViewName; projectId?: string; disputeId?: string; token?: string }>) => void;
  goBack: () => void;
  inProject: boolean;
  isAdmin: boolean;
  unread: number;
  setMobileOpen: (v: boolean) => void;
  projectCtx: ProjectNavContext;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
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
          <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
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
          <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {projectCtx.projectTitle ? projectCtx.projectTitle.slice(0, 18) : "Project"}
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
          <button
            onClick={() => { goBack(); setMobileOpen(false); }}
            className="nav-link mt-2 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to projects
          </button>
        </>
      )}

      <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
      className={`nav-link ${active ? "active" : ""}`}
    >
      <Icon className={`h-[18px] w-[18px] ${active ? "" : "text-muted-foreground"}`} />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          active
            ? "bg-primary-foreground text-primary"
            : "bg-primary text-primary-foreground"
        }`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
