"use client";

import { useEffect, useState } from "react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError } from "@/lib/client-api";
import { Loader2, CheckCircle2, XCircle, Users } from "lucide-react";

type InvitationInfo = {
  invitationId: string;
  projectId: string;
  projectTitle: string;
  projectDescription: string;
  ownerName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  expiresAt: string;
};

export function InvitationView({ token }: { token?: string }) {
  const { navigate } = useNav();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token");
      setLoading(false);
      return;
    }
    // SECURITY (2026-10): URL-encode the token to prevent path-traversal
    // via crafted token values (e.g., ?token=../../admin/users).
    const encToken = encodeURIComponent(token);
    api
      .get<InvitationInfo>(`/api/invitations/${encToken}`)
      .then((data) => {
        setInfo(data);
        setError(null);
      })
      .catch((err: ApiError) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (dec: "ACCEPT" | "REJECT") => {
    if (!token) return;
    setActing(true);
    setError(null);
    try {
      const result = await api.post<{ ok: boolean; decision: string; projectId?: string }>("/api/invitations/" + encodeURIComponent(token), {
        token,
        decision: dec,
      });
      if (result.decision === "ACCEPTED" && result.projectId) {
        navigate({ view: "project-detail", projectId: result.projectId });
      } else {
        navigate({ view: "dashboard" });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Users className="h-6 w-6 text-primary" />
          <span className="font-semibold">Project Invitation</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{error ? "Invitation not available" : info?.projectTitle ?? "Invitation"}</CardTitle>
            <CardDescription>
              {error ? "This invitation may have expired or been revoked." : `Invited as ${info?.role.toLowerCase()}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : info ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Project description</p>
                  <p className="text-sm">{info.projectDescription}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Project owner</p>
                    <p className="font-medium">{info.ownerName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Invited by</p>
                    <p className="font-medium">{info.inviterName}</p>
                    <p className="text-xs text-muted-foreground">{info.inviterEmail}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Role</p>
                    <p className="font-medium">{info.role}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Expires</p>
                    <p className="font-medium">{new Date(info.expiresAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </>
            ) : null}

            {decision === null ? (
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => navigate({ view: "dashboard" })} disabled={acting}>
                  Decide later
                </Button>
                <Button variant="outline" onClick={() => submit("REJECT")} disabled={acting || !info}>
                  {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                  Decline
                </Button>
                <Button onClick={() => submit("ACCEPT")} disabled={acting || !info}>
                  {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Accept invitation
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
