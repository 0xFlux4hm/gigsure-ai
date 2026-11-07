"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, formatDateTime } from "@/lib/client-api";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Camera,
  Fingerprint,
  AlertTriangle,
  Info,
  RefreshCw,
} from "lucide-react";
import { PageHeader, LoadingState } from "@/components/shared/page-components";

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
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = () => {
    setLoading(true);
    api.get<KycStatus>("/api/kyc/me")
      .then(setStatus)
      .catch(() => setStatus({ status: "NONE", verified: false }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Camera cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera access denied. Please allow camera permissions in your browser."
          : err instanceof DOMException && err.name === "NotFoundError"
          ? "No camera found. Please connect a camera or skip the selfie step."
          : "Failed to start camera. You can still verify with NIN only."
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const captureSelfie = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the selfie horizontally (since video is mirrored)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset

    // Convert to base64 JPEG (compressed for API upload)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    // Strip the "data:image/jpeg;base64," prefix
    const base64 = dataUrl.split(",")[1];
    setSelfieBase64(base64);
    stopCamera();
  }, [stopCamera]);

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
        ...(selfieBase64 ? { selfieBase64 } : {}),
      });
      setShowForm(false);
      setPolling(true);

      // Poll for result (verification completes in a few seconds)
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
    return <LoadingState label="Loading KYC status…" />;
  }

  return (
    <div className="page-enter space-y-6 max-w-2xl">
      <PageHeader
        title="Identity verification (KYC)"
        description="Verify your identity with your National Identification Number (NIN). Required before participating in funding transactions."
        icon={ShieldCheck}
      />

      {/* Status card */}
      <Card className="premium-card">
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
              <Badge variant="default" className="flex items-center gap-1 badge-success">
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
        <Card className="premium-card">
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
              <Input className="input-premium"
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
                Your NIN is protected — we never store the raw number.
              </p>
            </div>

            {/* Selfie capture for liveness verification */}
            <div className="space-y-3">
              <Label>Selfie verification (liveness check)</Label>
              {selfieBase64 ? (
                <div className="flex items-center gap-3">
                  <img
                    src={`data:image/jpeg;base64,${selfieBase64}`}
                    alt="Captured selfie"
                    className="h-20 w-20 rounded-lg border object-cover"
                  />
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Selfie captured
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1"
                      onClick={() => { setSelfieBase64(null); }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Retake
                    </Button>
                  </div>
                </div>
              ) : cameraActive ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden border bg-black max-w-xs">
                    <video
                      ref={videoRef}
                      className="w-full h-auto"
                      style={{ transform: "scaleX(-1)" }}
                      playsInline
                      muted
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={captureSelfie}>
                      <Camera className="h-4 w-4 mr-1" /> Capture Selfie
                    </Button>
                    <Button size="sm" variant="outline" onClick={stopCamera}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button size="sm" variant="outline" onClick={startCamera}>
                    <Camera className="h-4 w-4 mr-2" /> Start Camera
                  </Button>
                  {cameraError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{cameraError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A selfie with liveness check is required for full KYC verification
                    for full KYC verification.
                  </p>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Your NIN is verified against the Nigerian government database. A selfie liveness check ensures you are the real owner.
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
      <Card className="premium-card">
        <CardHeader>
          <CardTitle className="text-base">Why KYC?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Funding security.</strong> Before any money changes hands
             we verify that participants are real people with valid Nigerian
            National Identification Numbers. This prevents fraud, sockpuppet accounts, and
            impersonation.
          </p>
          <p>
            <strong className="text-foreground">Your data is protected.</strong> We store only
            a masked reference and the last 4 digits for display. The full NIN is sent
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
