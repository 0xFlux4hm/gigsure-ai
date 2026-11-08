"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/client-api";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
  Briefcase,
  Scale,
  Clock,
  ShieldCheck,
  Mail,
  type LucideIcon,
} from "lucide-react";

type InvitationInfo = {
  invitationId: string;
  projectId: string;
  projectTitle: string;
  projectDescription: string;
  ownerName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  expiresAt: string;
  personalMessage?: string | null;
  createdAt?: string;
  lastResentAt?: string | null;
};

type RoleInfo = {
  label: string;
  icon: LucideIcon;
};

function getRoleInfo(role: string): RoleInfo {
  switch (role) {
    case "COLLABORATOR":
      return { label: "Service Provider", icon: Briefcase };
    case "TEAM_LEAD":
      return { label: "Team Lead", icon: Users };
    case "REVIEWER":
      return { label: "Reviewer", icon: Scale };
    default:
      return { label: role.replace(/_/g, " "), icon: Briefcase };
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function getExpiryInfo(expiresAt: string): {
  label: string;
  urgency: "green" | "amber" | "red";
} {
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return { label: "Unknown", urgency: "green" };
  const diffMs = exp - Date.now();
  if (diffMs <= 0) return { label: "Expired", urgency: "red" };
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 24) {
    return { label: `Expires in ${Math.max(1, Math.round(hours))}h`, urgency: "red" };
  }
  if (hours < 72) {
    return { label: `Expires in ${Math.round(hours / 24)}d`, urgency: "amber" };
  }
  const dateStr = new Date(expiresAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { label: dateStr, urgency: "green" };
}

export function InvitationView({ token }: { token?: string }) {
  const { navigate } = useNav();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [acting, setActing] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token");
      setLoading(false);
      return;
    }
    // URL-encode the token to prevent path-traversal
    // via crafted token values (e.g., ?token=../../admin/users).
    const encToken = encodeURIComponent(token);
    api
      .get<InvitationInfo>(`/api/invitations/${encToken}`)
      .then((data) => {
        setInfo(data);
        setError(null);
      })
      .catch((err: ApiError) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (dec: "ACCEPT" | "REJECT") => {
    if (!token) return;
    setActing(true);
    setError(null);
    setDecision(dec);
    try {
      const result = await api.post<{ ok: boolean; decision: string; projectId?: string }>(
        "/api/invitations/" + encodeURIComponent(token),
        { token, decision: dec }
      );
      if (result.decision === "ACCEPTED" && result.projectId) {
        setAccepted(true);
        const projectId = result.projectId;
        // Brief success animation before navigating to the project workspace.
        window.setTimeout(() => navigate({ view: "project-detail", projectId }), 1200);
      } else {
        navigate({ view: "dashboard" });
      }
    } catch (err) {
      setError((err as Error).message);
      setDecision(null);
    } finally {
      setActing(false);
    }
  };

  // -- Loading state: professional skeleton --
  if (loading) {
    return (
      <div className="page-enter min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-lg">
          <Card className="premium-card overflow-hidden p-0 gap-0">
            <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 sm:px-8 py-8 border-b border-border/40 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-3/4" />
            </div>
            <CardContent className="p-6 sm:p-8 space-y-5">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-6 w-36 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <Skeleton className="h-14 w-full rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
              <Skeleton className="h-12 w-full rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -- Success state: brief checkmark animation before redirect --
  if (accepted) {
    return (
      <div className="page-enter min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="premium-card w-full max-w-lg text-center overflow-hidden">
          <CardContent className="pt-12 pb-10 px-6 space-y-5">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping opacity-60" />
              <span className="absolute inset-2 rounded-full bg-primary/10" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-lg">
                <CheckCircle2 className="h-9 w-9" />
              </span>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight">You&rsquo;re in!</h2>
              <p className="text-sm text-muted-foreground">
                Invitation accepted. Redirecting you to the project workspace…
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>One moment…</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -- Main invitation / error card --
  const roleInfo = info ? getRoleInfo(info.role) : null;
  const expiry = info ? getExpiryInfo(info.expiresAt) : null;
  const RoleIcon = roleInfo?.icon;

  const expiryClasses =
    expiry?.urgency === "red"
      ? "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/20"
      : expiry?.urgency === "amber"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20";

  const showActions = decision === null && !accepted;

  return (
    <div className="page-enter min-h-screen flex items-center justify-center bg-muted/30 p-4 py-8 sm:py-12">
      <div className="w-full max-w-lg">
        <Card className="premium-card overflow-hidden p-0 gap-0">
          {/* -- Hero header with gradient -- */}
          <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 sm:px-8 py-7 sm:py-8 border-b border-border/40">
            <div className="absolute top-0 right-0 h-32 w-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow-sm">
                  G
                </div>
                <span className="font-bold text-lg tracking-tight">
                  GigSure<span className="text-primary"> AI</span>
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary/80">
                  <Mail className="h-3.5 w-3.5" />
                  Project Invitation
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight break-words">
                  {error ? "Invitation not available" : info?.projectTitle ?? "Project Invitation"}
                </h1>
              </div>
            </div>
          </div>

          <CardContent className="p-6 sm:p-8 space-y-5">
            {error ? (
              /* -- Error state -- */
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <XCircle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium text-foreground">We couldn&rsquo;t load this invitation</p>
                    <p className="text-sm text-muted-foreground">
                      The link may have expired, been revoked, or is no longer valid.
                    </p>
                  </div>
                </div>
                <Alert variant="destructive">
                  <AlertDescription className="break-words">{error}</AlertDescription>
                </Alert>
              </div>
            ) : info ? (
              <>
                {/* -- Inviter card -- */}
                <div className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/30 p-4 shadow-[var(--shadow-sm)]">
                  <Avatar className="size-12 ring-2 ring-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground font-semibold text-base">
                      {getInitials(info.inviterName || info.inviterEmail)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">Invited by</p>
                    <p className="font-semibold text-sm truncate">{info.inviterName}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{info.inviterEmail}</span>
                    </p>
                  </div>
                </div>

                {/* -- Role badge -- */}
                {roleInfo && RoleIcon && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Your role</span>
                    <Badge
                      variant="secondary"
                      className="gap-1.5 rounded-full bg-primary/8 text-primary border-primary/15 px-3 py-1 text-xs font-medium"
                    >
                      <RoleIcon className="h-3.5 w-3.5" />
                      {roleInfo.label}
                    </Badge>
                  </div>
                )}

                {/* -- Project info section -- */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />
                    Project details
                  </div>
                  {info.projectDescription ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {info.projectDescription}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground/70">No description provided.</p>
                  )}
                </div>

                {/* -- Personal message (if present) -- */}
                {info.personalMessage && (
                  <div className="relative overflow-hidden rounded-lg bg-muted/40 py-3 pl-4 pr-3">
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary/70" />
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Message from {info.inviterName}:
                    </p>
                    <p className="text-sm italic leading-relaxed text-foreground">
                      &ldquo;{info.personalMessage}&rdquo;
                    </p>
                  </div>
                )}

                {/* -- Expiry + project owner -- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {expiry && (
                    <div
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ring-1 ring-inset ${expiryClasses}`}
                    >
                      <Clock className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider opacity-80">Expires</p>
                        <p className="text-xs font-semibold truncate">{expiry.label}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 ring-1 ring-inset bg-muted/40 ring-border/60">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Project owner
                      </p>
                      <p className="text-xs font-semibold truncate">{info.ownerName}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {/* -- Action buttons -- */}
            {showActions && error ? (
              <div className="pt-1">
                <Button
                  size="lg"
                  className="w-full h-11"
                  onClick={() => navigate({ view: "dashboard" })}
                >
                  Back to dashboard
                </Button>
              </div>
            ) : null}
            {showActions && info ? (
              <div className="space-y-2 pt-1">
                <Button
                  size="lg"
                  className="w-full h-12 text-base shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                  onClick={() => submit("ACCEPT")}
                  disabled={acting}
                >
                  {acting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  Accept invitation
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 h-10 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50"
                    onClick={() => submit("REJECT")}
                    disabled={acting}
                  >
                    {acting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Decline
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="flex-1 h-10 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate({ view: "dashboard" })}
                    disabled={acting}
                  >
                    Decide later
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>

          {/* -- Footer trust note -- */}
          {!error && info ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 bg-muted/20 px-6 sm:px-8 py-3">
              <ShieldCheck className="h-3.5 w-3.5 text-primary/70 shrink-0" />
              <span>Protected by GigSure AI Payment Protection</span>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
