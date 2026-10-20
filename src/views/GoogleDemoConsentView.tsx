"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useNav } from "@/lib/nav";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Loader2 } from "lucide-react";

/**
 * Demo Google consent screen — shown when real Google OAuth credentials are not
 * configured. Looks like Google's consent screen so users can experience the
 * OAuth flow, but is clearly labelled as simulated.
 */
export function GoogleDemoConsentView() {
  const { navigate } = useNav();
  const [state, setState] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string>("/");
  const [consentEmail, setConsentEmail] = useState("");
  const [consentName, setConsentName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    setState(url.searchParams.get("state"));
    setCallbackUrl(url.searchParams.get("callbackUrl") ?? "/");
  }, []);

  const approve = async () => {
    if (!state) {
      setError("Missing state parameter");
      return;
    }
    if (!consentEmail) {
      setError("Please enter an email");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/google-demo/callback?state=${encodeURIComponent(state)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentEmail, consentName: consentName || "Demo User" }),
      });
      const data = await res.json() as { code?: string; error?: string; redirect_uri?: string };
      if (!res.ok || !data.code) {
        setError(data.error ?? "Demo OAuth failed");
        return;
      }
      // Use the code to sign in via the google-demo NextAuth provider
      await signIn("google-demo", {
        code: data.code,
        callbackUrl: callbackUrl.startsWith("/") ? `/?view=dashboard` : "/?view=dashboard",
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="font-semibold">GigSure<span className="text-primary"> AI</span></span>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-white border flex items-center justify-center">
                <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.21-4.74 3.21-8.33z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Sign in with Google</CardTitle>
                <CardDescription className="text-xs">to continue to GigSure AI</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
              <AlertDescription className="text-xs">
                <strong>Simulated consent screen.</strong> This is a demo Google
                sign-in flow because real Google OAuth credentials are not
                configured in this environment. The entered email is used as a
                synthetic Google identity for testing the account-linking workflow.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="consentEmail">Google account email</Label>
                <Input
                  id="consentEmail"
                  type="email"
                  value={consentEmail}
                  onChange={(e) => setConsentEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consentName">Display name</Label>
                <Input
                  id="consentName"
                  type="text"
                  value={consentName}
                  onChange={(e) => setConsentName(e.target.value)}
                  placeholder="Your name"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="rounded border p-3 text-xs text-muted-foreground">
              <strong>Permissions requested:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Your email address</li>
                <li>Your public profile (name)</li>
              </ul>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => navigate({ view: "login" })} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={approve} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Allow
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
