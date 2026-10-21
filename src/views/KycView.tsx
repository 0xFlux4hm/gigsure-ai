"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, formatDateTime } from "@/lib/client-api";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Camera,
  Fingerprint,
  AlertTriangle,
  Info,
} from "lucide-react";

type KycStatus = {
  status: string;
  verified: boolean;
  provider?: string;
  ninLast4?: string;
  fullName?: string;
  verifiedAt?: string | null;
  expiresAt?: string | null;
  failureReason?: string | null;
};

export function KycView() {
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [ninNumber, setNinNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<KycStatus>("/api/kyc/me")
      .then(setStatus)
      .catch(() => setStatus({ status: "NONE", verified: false }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    if (ninNumber.length !== 11 || !/^\d{11}$/.test(ninNumber)) {
      setError("NIN must be exactly 11 digits.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ verificationId: string; provider: string; status: string }>("/api/kyc/initiate", {
        ninNumber,
      });
      setShowForm(false);
      setPolling(true);

      // Poll for result (mock provider returns instantly, Smile ID takes ~2-5s)
      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const result = await api.get<{ status: string; fullName?: string; failureReason?: string }>(
              `/api/kyc/status/${(await api.get<{ verificationId?: string }>("/api/kyc/me")).verificationId ?? result.verificationId}`,
            );
            if (result.status === "VERIFIED" || result.status === "REJECTED") {
              load();
              setPolling(false);
              return;
            }
          } catch {
            // retry
          }
        }
        setPolling(false);
      };
      poll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Identity Verification (KYC)
        </h1>
        <p className="text-muted-foreground text-sm">
          Verify your identity with your National Identification Number (NIN).
          Required before participating in funding transactions.
        </p>
      </div>

      {/* Status card */}
      <Card>
        <CardContent className="p-6">
          {status?.verified ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Verified</h3>
                <p className="text-sm text-muted-foreground">
                  {status.fullName} · NIN ending in {status.ninLast4}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Verified on {status.verifiedAt ? formatDateTime(status.verifiedAt) : "—"}
                  {status.expiresAt && ` · Expires ${formatDateTime(status.expiresAt)}`}
                </p>
              </div>
              <Badge variant="default" className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Verified
              </Badge>
            </div>
          ) : status?.status === "REJECTED" ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-7 w-7 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Verification Failed</h3>
                <p className="text-sm text-muted-foreground">
                  {status.failureReason ?? "Your verification could not be completed."}
                </p>
              </div>
              <Button onClick={() => setShowForm(true)}>Try Again</Button>
            </div>
          ) : polling ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <h3 className="font-semibold">Verifying your identity…</h3>
                <p className="text-sm text-muted-foreground">
                  Checking your NIN against the national database. This usually takes a few seconds.
                </p>
              </div>
            </div>
          ) : !showForm ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">Not Verified</h3>
                <p className="text-sm text-muted-foreground">
                  Complete KYC verification to unlock funding features.
                </p>
              </div>
              <Button onClick={() => setShowForm(true)}>
                <Fingerprint className="mr-2 h-4 w-4" /> Verify Now
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Verification form */}
      {showForm && !status?.verified && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">NIN Verification</CardTitle>
            <CardDescription>
              Enter your 11-digit National Identification Number. We verify it against
              the Nigerian government database via {status?.provider === "smile_id" ? "Smile ID" : "our verification provider"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nin">National Identification Number (NIN)</Label>
              <Input
                id="nin"
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={ninNumber}
                onChange={(e) => setNinNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="12345678901"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Your NIN is hashed with SHA-256 before storage. We never store the raw number.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {status?.provider === "mock"
                  ? "Using MOCK verification provider (dev mode). In production, this uses Smile ID's NIN + selfie liveness verification."
                  : "Your NIN is verified against the Nigerian government database. A selfie liveness check ensures you are the real owner."}
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={submitting || ninNumber.length !== 11}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Verify Identity
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why KYC?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Funding security.</strong> Before any money changes hands
            (even simulated), we verify that participants are real people with valid Nigerian
            National Identification Numbers. This prevents fraud, sockpuppet accounts, and
            impersonation.
          </p>
          <p>
            <strong className="text-foreground">Your data is protected.</strong> We store only a
            SHA-256 hash of your NIN + the last 4 digits for display. The full NIN is sent
            directly to the verification provider and never persisted in our database.
          </p>
          <p>
            <strong className="text-foreground">Verification is required for:</strong>
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>Initiating milestone funding</li>
            <li>Receiving fund releases</li>
            <li>Requesting refunds</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
