"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/client-api";
import { Loader2, ShieldCheck, Trash2, Link2, KeyRound } from "lucide-react";

type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  accountStatus: string;
  lastLoginAt: string | null;
  identities: Array<{
    provider: string;
    providerSubject: string;
    lastAuthenticatedAt: string | null;
    createdAt: string;
  }>;
};

export function SettingsSecurityView() {
  const { data: session, update } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Sudo mode (reauth) state
  const [sudoOpen, setSudoOpen] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [sudoLoading, setSudoLoading] = useState(false);
  const [sudoAction, setSudoAction] = useState<"link-google" | "unlink-google" | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [linkPopup, setLinkPopup] = useState<Window | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<User>("/api/me").then(setUser).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for popup messages (Google linking callback)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "google-linked" && e.data.success) {
        setOk("Google account linked successfully! Please sign in again.");
        setSudoOpen(false);
        load();
        // Session is invalidated — force re-login
        setTimeout(() => {
          window.location.href = "/?view=login";
        }, 2000);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [load]);

  // Check if a Google linking popup was closed without completing
  useEffect(() => {
    if (!linkPopup) return;
    const interval = setInterval(() => {
      if (linkPopup.closed) {
        setLinkPopup(null);
        setSudoOpen(false);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [linkPopup]);

  const changePassword = async () => {
    setChangingPassword(true);
    setError(null);
    setOk(null);
    try {
      if (passwordIdentity) {
        // Existing password user — change password
        await api.post("/api/auth/change-password", { currentPassword, newPassword });
        setOk("Password changed. Please sign in again with your new password.");
      } else {
        // Google-only user — set password for the first time
        await api.post("/api/auth/set-password", { newPassword });
        setOk("Password set successfully! You can now sign in with email + password.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => {
        window.location.href = "/?view=login";
      }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChangingPassword(false);
    }
  };

  // Step 1: Request sudo mode (reauth)
  const requestSudo = async (action: "link-google" | "unlink-google", target?: string) => {
    setSudoAction(action);
    setUnlinkTarget(target ?? null);
    setSudoPassword("");
    setError(null);
    setSudoOpen(true);
  };

  // Step 2: Verify password → get sudo token → elevate session
  const verifySudo = async () => {
    setSudoLoading(true);
    setError(null);
    try {
      // 1. Call /api/auth/reauth to verify password + get sudo token
      const res = await api.post<{ sudoToken: string }>("/api/auth/reauth", {
        currentPassword: sudoPassword,
      });

      // 2. Call update() with the sudo token to elevate the session
      await update({ sudoToken: res.sudoToken });

      // 3. Now in sudo mode — perform the action
      setSudoOpen(false);
      setSudoPassword("");

      if (sudoAction === "link-google") {
        openGoogleLinkPopup();
      } else if (sudoAction === "unlink-google" && unlinkTarget) {
        await performUnlink(unlinkTarget);
      }
    } catch (err) {
      setError((err as Error).message ?? "Reauthentication failed");
    } finally {
      setSudoLoading(false);
    }
  };

  // Open Google OAuth consent in a popup
  const openGoogleLinkPopup = () => {
    // Use the configured Google client ID from the auth providers endpoint
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
    if (!clientId) {
      setError("Google OAuth is not configured. Please contact support.");
      return;
    }

    // Build the OAuth URL — redirect to our /google-link-callback page
    const redirectUri = `${window.location.origin}/google-link-callback`;
    const scope = "openid email profile";
    const responseType = "code";
    const prompt = "consent";

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${responseType}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&prompt=${prompt}`;

    const popup = window.open(authUrl, "google-link", "width=500,height=600,scrollbars=yes");
    if (popup) {
      setLinkPopup(popup);
    } else {
      setError("Popup was blocked. Please allow popups for this site.");
    }
  };

  const performUnlink = async (providerSubject: string) => {
    try {
      await api.post("/api/auth/unlink-google", { provider: "google", providerSubject });
      setOk("Google account unlinked. Please sign in again.");
      setTimeout(() => {
        window.location.href = "/?view=login";
      }, 2000);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const unlinkGoogle = (providerSubject: string) => {
    if (!confirm("Unlink this Google identity? You'll no longer be able to sign in with Google. You'll need to sign in again.")) return;
    requestSudo("unlink-google", providerSubject);
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const passwordIdentity = user.identities.find((i) => i.provider === "password");
  const googleIdentities = user.identities.filter((i) => i.provider === "google");
  const hasGoogle = googleIdentities.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Security
        </h1>
        <p className="text-muted-foreground text-sm">Manage authentication methods and password.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email verified</span>
            {user.emailVerifiedAt ? <Badge variant="default">Verified</Badge> : <Badge variant="outline">Pending</Badge>}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last login</span>
            <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication methods</CardTitle>
          <CardDescription>Link multiple methods for recovery. You must keep at least one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {passwordIdentity && (
            <div className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">Password</div>
                  <div className="text-xs text-muted-foreground">Set {new Date(passwordIdentity.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
              <Badge variant="default">Active</Badge>
            </div>
          )}
          {googleIdentities.map((g) => (
            <div key={g.providerSubject} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3 min-w-0">
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.21-4.74 3.21-8.33z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                </svg>
                <div className="min-w-0">
                  <div className="font-medium text-sm">Google</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {`sub: ${g.providerSubject.slice(0, 12)}…`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Linked {new Date(g.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              {user.identities.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => unlinkGoogle(g.providerSubject)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}

          {/* Link Google button */}
          {!hasGoogle && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => requestSudo("link-google")}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Link Google account
            </Button>
          )}

          {!passwordIdentity && (
            <p className="text-sm text-muted-foreground">
              No password set. Use the form below to add one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {passwordIdentity ? "Change password" : "Set password"}
          </CardTitle>
          <CardDescription>
            {passwordIdentity
              ? "Requires your current password (reauthentication)."
              : "Set a password as an alternative sign-in method."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {passwordIdentity && (
            <div className="space-y-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changingPassword}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changingPassword}
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a digit.</p>
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          {ok && <div className="text-sm text-primary">{ok}</div>}
          <Button onClick={changePassword} disabled={changingPassword || !newPassword || (passwordIdentity ? !currentPassword : false)}>
            {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {passwordIdentity ? "Change password" : "Set password"}
          </Button>
        </CardContent>
      </Card>

      {/* Sudo mode (reauth) modal */}
      <Dialog open={sudoOpen} onOpenChange={setSudoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Confirm your identity
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {sudoAction === "link-google"
                ? "To link your Google account, please enter your password to confirm it's really you."
                : "To unlink your Google account, please enter your password to confirm it's really you."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="sudo-pw">Password</Label>
              <Input
                id="sudo-pw"
                type="password"
                value={sudoPassword}
                onChange={(e) => setSudoPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sudoPassword) verifySudo();
                }}
                autoFocus
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSudoOpen(false); setSudoPassword(""); setError(null); }}>
              Cancel
            </Button>
            <Button onClick={verifySudo} disabled={!sudoPassword || sudoLoading}>
              {sudoLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
