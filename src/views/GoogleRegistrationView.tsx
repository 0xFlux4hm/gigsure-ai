"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/client-api";
import { ShieldCheck, Loader2, Check, User, Mail, FileText } from "lucide-react";

export function GoogleRegistrationView() {
  const { navigate } = useNav();
  const { update: updateSession, data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [success, setSuccess] = useState(false);

  // Get the user's Google profile info from /api/me
  const [userInfo, setUserInfo] = useState<{ email: string; displayName: string } | null>(null);
  useEffect(() => {
    api.get<{ email: string; displayName: string; accountStatus?: string }>("/api/me")
      .then((u) => {
        if (u.accountStatus === "ACTIVE") {
          // Already active — go to dashboard
          navigate({ view: "dashboard" });
          return;
        }
        setUserInfo({ email: u.email, displayName: u.displayName });
      })
      .catch(() => {
        setError("Could not load your profile. Please try signing in again.");
      });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      setError("Please accept the Terms of Service to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post<{ activated: boolean }>("/api/auth/complete-registration", {
        acceptedTerms: true,
      });

      //
      // HISTORY: this flow broke THREE TIMES before:
      //   1. complete-registration bumped passwordChangedAt → JWT invalidated
      //   2. Even after that fix, used setTimeout + window.location.href →
      //      hard reload races with session cookie set
      //   3. Even after the in-band updateSession() fix, the cached client
      //      session sometimes still shows PENDING_REGISTRATION, causing the
      //      Router to bounce the user back to this page
      //
      //   1. Call complete-registration (server marks user ACTIVE in DB)
      //   2. Force-useSession refresh via updateSession() — this triggers
      //      jwt() callback which re-reads accountStatus from DB
      //   3. VERIFY the new session has accountStatus === "ACTIVE"
      //   4. If yes → navigate via SPA (no hard reload)
      //   5. If no (refresh failed or returned stale status) → fall back to
      //      hard reload, which forces a fresh /api/auth/session fetch
      let refreshedSession;
      try {
        refreshedSession = await updateSession();
      } catch {
        // Network error — hard reload picks up the new state from DB
        window.location.href = "/?view=dashboard";
        return;
      }

      // Verify the refreshed session has ACTIVE status. If not, hard reload
      // as a final safety net.
      const newStatus = (refreshedSession?.user as { accountStatus?: string } | undefined)?.accountStatus
        ?? (session?.user as { accountStatus?: string } | undefined)?.accountStatus;
      if (newStatus !== "ACTIVE") {
        // Stale session — hard reload will re-fetch from /api/auth/session
        window.location.href = "/?view=dashboard";
        return;
      }

      setSuccess(true);
      // Brief success message, then navigate in-app (no hard reload).
      setTimeout(() => {
        navigate({ view: "dashboard" });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Welcome to GigSure AI!</h2>
            <p className="text-muted-foreground text-sm">
              Your account is now active. Redirecting you to your dashboard...
            </p>
            <Loader2 className="h-4 w-4 animate-spin mx-auto mt-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              G
            </div>
            <span className="font-bold text-lg tracking-tight">GigSure<span className="text-primary"> AI</span></span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Complete Your Registration
            </CardTitle>
            <CardDescription>
              You&apos;ve signed in with Google. Review your information and accept
              the Terms of Service to activate your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Profile info from Google */}
            {userInfo && (
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <User className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-medium">{userInfo.displayName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Email (verified by Google)</div>
                    <div className="font-medium">{userInfo.email}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Terms acceptance */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded"
                  />
                  <span className="text-sm text-muted-foreground">
                    I accept the{" "}
                    <span className="text-primary font-medium">Terms of Service</span> and{" "}
                    <span className="text-primary font-medium">Privacy Notice</span>.
                    I understand this is a project collaboration platform, not a
                    payment custodian. Funds are held by licensed payment
                    providers (Monnify/OPay) under GigSure Payment Protection.
                  </span>
                </label>
              </div>

              {/* Security info */}
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Security & Privacy
                </div>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>Your Google password is never shared with GigSure AI</li>
                  <li>You can unlink Google at any time in Settings → Security</li>
                  <li>You can add a password as an alternative sign-in method</li>
                  <li>Your data is protected under NDPR (Nigeria Data Protection Regulation)</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    signIn("google", { callbackUrl: "/?view=landing" });
                  }}
                  disabled={loading}
                >
                  Use different account
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading || !accepted}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Activate my account
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
