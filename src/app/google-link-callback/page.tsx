"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function LinkCallbackContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (error) {
      setStatus("error");
      setMessage(`Google error: ${error}`);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received from Google.");
      return;
    }

    // Send the code to the link-google endpoint
    fetch("/api/auth/link-google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.ok) {
          setStatus("success");
          setMessage(data.data?.message ?? "Google account linked successfully.");

          // Notify parent window and close popup after 2 seconds
          setTimeout(() => {
            if (window.opener) {
              window.opener.postMessage({ type: "google-linked", success: true }, "*");
              window.close();
            } else {
              window.location.href = "/?view=settings-security";
            }
          }, 2000);
        } else {
          setStatus("error");
          setMessage(data.error ?? "Failed to link Google account.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [code, error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-lg font-semibold">Linking your Google account…</h2>
            <p className="text-sm text-muted-foreground">Verifying your Google identity.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold">Google account linked!</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Closing this window…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Linking failed</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <button
              onClick={() => window.close()}
              className="text-sm text-primary hover:underline"
            >
              Close window
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LinkCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <LinkCallbackContent />
    </Suspense>
  );
}
