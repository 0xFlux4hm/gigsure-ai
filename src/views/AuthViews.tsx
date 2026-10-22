"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/client-api";
import { ShieldCheck, Loader2 } from "lucide-react";

/**
 * Check if Google OAuth is configured by fetching the auth providers list.
 * Returns true only if the "google" provider is registered.
 */
function useGoogleAuthAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    api.get<Record<string, { id: string }>>("/api/auth/providers")
      .then((providers) => {
        setAvailable(!!providers?.google);
      })
      .catch(() => setAvailable(false));
  }, []);
  return available;
}

export function AuthViews() {
  const { view, token, navigate } = useNav();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate({ view: "landing" })} className="flex items-center gap-2">
            <img src="/images/logo.png" alt="GigSure AI logo" className="h-7 w-7 object-contain" />
            <span className="font-semibold text-lg">GigSure<span className="text-primary"> AI</span></span>
          </button>
          <Button variant="ghost" onClick={() => navigate({ view: "landing" })}>← Back</Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {view === "login" && <LoginForm />}
          {view === "register" && <RegisterForm />}
          {view === "verify-email" && <VerifyEmailForm token={token} />}
          {view === "forgot-password" && <ForgotPasswordForm />}
          {view === "reset-password" && <ResetPasswordForm token={token} />}
        </div>
      </main>
    </div>
  );
}

function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const googleAvailable = useGoogleAuthAvailable();

  // Don't render the Google button if Google OAuth isn't configured.
  // This prevents users from clicking a button that will just show an error.
  if (!googleAvailable) return null;

  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await signIn("google", { callbackUrl: "/?view=dashboard" });
      }}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.21-4.74 3.21-8.33z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
        </svg>
      )}
      {label}
    </Button>
  );
}

/**
 * Divider that only shows when Google OAuth is available.
 * When Google isn't configured, this returns null so the form
 * doesn't have a dangling "or" divider.
 */
function GoogleDivider() {
  const googleAvailable = useGoogleAuthAvailable();
  if (!googleAvailable) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function LoginForm() {
  const { navigate } = useNav();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/?view=dashboard",
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password. Please try again.");
      return;
    }
    if (res?.ok) {
      window.location.href = res.url ?? "/?view=dashboard";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your GigSure AI account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton />
        <GoogleDivider />
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Sign in
          </Button>
        </form>
        <button
          type="button"
          className="text-sm text-primary hover:underline w-full text-center"
          onClick={() => navigate({ view: "forgot-password" })}
        >
          Forgot password?
        </button>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm text-muted-foreground">
        <p>Don&apos;t have an account?</p>
        <Button variant="outline" className="w-full" onClick={() => navigate({ view: "register" })}>
          Create account
        </Button>
      </CardFooter>
    </Card>
  );
}

function RegisterForm() {
  const { navigate } = useNav();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!terms) {
      setError("Please accept the terms to continue.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ verificationUrl?: string; message?: string; created?: boolean }>("/api/auth/register", {
        email,
        displayName,
        password,
        termsAccepted: true,
      });
      if (res.verificationUrl) setVerifyUrl(res.verificationUrl);
      if (res.created) {
        // Auto-login after registration, then redirect to dashboard
        const signInResult = await signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl: "/?view=dashboard",
        });
        if (signInResult?.ok) {
          // Redirect to dashboard on successful auto-login
          window.location.href = signInResult.url ?? "/?view=dashboard";
        } else if (signInResult?.error) {
          // Auto-login failed — likely needs email verification
          setError("Account created! Please check your email for a verification link, then sign in.");
        }
      }
    } catch (err) {
      setError((err as Error).message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Free for individuals. No credit card required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleButton label="Sign up with Google" />
        <GoogleDivider />
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={loading}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a digit.</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-1"
            />
            <span className="text-muted-foreground">
              I accept the Terms of Service and Privacy Notice. I understand
              this is a project collaboration platform, not a payment custodian.
            </span>
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create account
          </Button>
        </form>
        {verifyUrl && (
          <Alert>
            <AlertDescription>
              Verification link generated (dev mode):{" "}
              <a href={verifyUrl} className="text-primary hover:underline break-all">
                Click to verify your email
              </a>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm text-muted-foreground">
        <p>Already have an account?</p>
        <Button variant="outline" className="w-full" onClick={() => navigate({ view: "login" })}>
          Sign in
        </Button>
      </CardFooter>
    </Card>
  );
}

function VerifyEmailForm({ token }: { token?: string }) {
  const { navigate } = useNav();
  const [enteredToken, setEnteredToken] = useState(token ?? "");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/verify-email", { token: enteredToken });
      setOk(true);
      setTimeout(() => navigate({ view: "login" }), 2000);
    } catch (err) {
      setError((err as Error).message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          Enter the verification token emailed to you. In dev mode, the link is shown after registration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token">Verification token</Label>
            <Input
              id="token"
              type="text"
              value={enteredToken}
              onChange={(e) => setEnteredToken(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {ok && (
            <Alert>
              <AlertDescription>Email verified. Redirecting to sign-in…</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Verify email
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ForgotPasswordForm() {
  const { navigate } = useNav();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError((err as Error).message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll send a reset link if the email is registered.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Alert>
            <AlertDescription>
              If the email is registered, a reset link has been sent. In dev mode,
              check the server log for the token.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send reset link
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full" onClick={() => navigate({ view: "login" })}>
          Back to sign in
        </Button>
      </CardFooter>
    </Card>
  );
}

function ResetPasswordForm({ token }: { token?: string }) {
  const { navigate } = useNav();
  const [enteredToken, setEnteredToken] = useState(token ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token: enteredToken, newPassword });
      setOk(true);
      setTimeout(() => navigate({ view: "login" }), 2000);
    } catch (err) {
      setError((err as Error).message ?? "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Use a strong password you haven&apos;t used before.</CardDescription>
      </CardHeader>
      <CardContent>
        {ok ? (
          <Alert>
            <AlertDescription>Password reset. Redirecting to sign-in…</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="token">Reset token</Label>
              <Input
                id="token"
                type="text"
                value={enteredToken}
                onChange={(e) => setEnteredToken(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newpassword">New password</Label>
              <Input
                id="newpassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reset password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
