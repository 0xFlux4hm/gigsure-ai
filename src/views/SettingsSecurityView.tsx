"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { Loader2, ShieldCheck, Trash2, Link2 } from "lucide-react";

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get<User>("/api/me").then(setUser).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const changePassword = async () => {
    setChangingPassword(true);
    setError(null);
    setOk(null);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      setOk("Password changed. Please sign in again with your new password.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChangingPassword(false);
    }
  };

  const unlinkGoogle = async (providerSubject: string) => {
    if (!confirm("Unlink this Google identity? You'll no longer be able to sign in with Google.")) return;
    try {
      await api.post("/api/auth/unlink-google", { provider: "google", providerSubject });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const passwordIdentity = user.identities.find((i) => i.provider === "password");
  const googleIdentities = user.identities.filter((i) => i.provider === "google" || i.provider === "google-demo");

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
              <div>
                <div className="font-medium text-sm">Password</div>
                <div className="text-xs text-muted-foreground">Set {new Date(passwordIdentity.createdAt).toLocaleDateString()}</div>
              </div>
              <Badge variant="default">Active</Badge>
            </div>
          )}
          {googleIdentities.map((g) => (
            <div key={g.providerSubject} className="flex items-center justify-between p-3 border rounded">
              <div className="min-w-0">
                <div className="font-medium text-sm">Google</div>
                <div className="text-xs text-muted-foreground truncate">
                  {g.provider === "google-demo" ? "Demo Google (simulated)" : `sub: ${g.providerSubject.slice(0, 12)}…`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Linked {new Date(g.createdAt).toLocaleDateString()}
                </div>
              </div>
              {user.identities.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => unlinkGoogle(g.providerSubject)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {!passwordIdentity && (
            <p className="text-sm text-muted-foreground">No password set. Use the form below to add one.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Requires your current password (reauthentication).</CardDescription>
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
    </div>
  );
}
