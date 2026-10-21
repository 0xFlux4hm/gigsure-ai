/**
 * Client-side view router. Since the user only sees the `/` route, we manage
 * navigation state via Zustand. The browser URL is mirrored via the `view`
 * query parameter for shareable deep links and back/forward navigation.
 */
"use client";

import { create } from "zustand";

export type ViewName =
  | "landing"
  | "login"
  | "register"
  | "verify-email"
  | "forgot-password"
  | "reset-password"
  | "google-demo-consent"
  | "dashboard"
  | "projects"
  | "project-detail"
  | "project-contracts"
  | "project-team"
  | "project-tasks"
  | "project-compensation"
  | "project-milestones"
  | "project-funding"
  | "project-disputes"
  | "project-dispute-detail"
  | "project-ai"
  | "settings-profile"
  | "settings-security"
  | "settings-payouts"
  | "settings-notifications"
  | "settings-privacy"
  | "settings-audit"
  | "notifications"
  | "invitation"
  | "admin"
  | "kyc";

export interface ViewState {
  view: ViewName;
  // Optional context — projectId, disputeId, token, etc.
  projectId?: string;
  disputeId?: string;
  taskId?: string;
  token?: string;
  // Generic param bag.
  params?: Record<string, string>;
}

interface NavState extends ViewState {
  navigate: (s: Partial<ViewState>) => void;
  goBack: () => void;
  history: ViewState[];
}

const initial: ViewState = parseHash();

function parseHash(): ViewState {
  if (typeof window === "undefined") {
    // On server: return landing. Client will pick up the real ?view= on hydration.
    return { view: "landing" };
  }
  const url = new URL(window.location.href);
  const view = (url.searchParams.get("view") as ViewName | null) ?? "landing";
  const projectId = url.searchParams.get("project") ?? undefined;
  const disputeId = url.searchParams.get("dispute") ?? undefined;
  const token = url.searchParams.get("token") ?? undefined;
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!["view", "project", "dispute", "token"].includes(k)) params[k] = v;
  });
  return { view, projectId, disputeId, token, params };
}

function writeToUrl(s: ViewState): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", s.view);
  if (s.projectId) url.searchParams.set("project", s.projectId);
  else url.searchParams.delete("project");
  if (s.disputeId) url.searchParams.set("dispute", s.disputeId);
  else url.searchParams.delete("dispute");
  if (s.token) url.searchParams.set("token", s.token);
  else url.searchParams.delete("token");
  window.history.pushState({}, "", url.toString());
}

export const useNav = create<NavState>((set, get) => ({
  ...initial,
  history: [initial],
  navigate: (s) => {
    const current = get();
    const next: ViewState = { ...current, ...s };
    writeToUrl(next);
    set({ ...next, history: [...current.history, next] });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },
  goBack: () => {
    const h = get().history;
    if (h.length > 1) {
      const prev = h[h.length - 2];
      writeToUrl(prev);
      set({ ...prev, history: h.slice(0, -1) });
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const parsed = parseHash();
    useNav.setState({ ...parsed });
  });
}
