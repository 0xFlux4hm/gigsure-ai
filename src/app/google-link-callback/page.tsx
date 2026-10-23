"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function GoogleLinkCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(`Google authorization failed: ${error}`);
      // Notify parent window
      window.opener?.postMessage({ type: "google-linked", success: false, error }, "*");
      setTimeout(() => window.close(), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received from Google.");
      window.opener?.postMessage({ type: "google-linked", success: false, error: "no_code" }, "*");
      setTimeout(() => window.close(), 3000);
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
          setMessage("Google account linked successfully!");
          window.opener?.postMessage({ type: "google-linked", success: true }, "*");
          setTimeout(() => window.close(), 2000);
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to link Google account.");
          window.opener?.postMessage({ type: "google-linked", success: false, error: data.error }, "*");
          setTimeout(() => window.close(), 5000);
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message || "Network error.");
        window.opener?.postMessage({ type: "google-linked", success: false, error: err.message }, "*");
        setTimeout(() => window.close(), 5000);
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Linking your Google account…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
            <p className="font-medium">{message}</p>
            <p className="text-sm text-muted-foreground">This window will close automatically.</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 mx-auto text-destructive" />
            <p className="font-medium">{message}</p>
            <p className="text-sm text-muted-foreground">This window will close in a few seconds.</p>
          </>
        )}
      </div>
    </div>
  );
}
