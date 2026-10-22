"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/client-api";
import { Loader2, Download, Trash2, AlertTriangle, ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { exportPrivacyDataPDF } from "@/lib/pdf/export";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SettingsPrivacyView() {
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const doExport = async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      const res = await api.post<{ data: unknown }>("/api/privacy/export");
      // Generate and download a PDF instead of showing raw JSON
      exportPrivacyDataPDF(res.data as Parameters<typeof exportPrivacyDataPDF>[0]);
      setExportSuccess(true);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.post("/api/privacy/delete", {
        confirmPhrase,
        currentPassword: currentPassword || undefined,
      });
      window.location.href = "/?view=landing";
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Privacy &amp; data
        </h1>
        <p className="text-muted-foreground text-sm">Export your data or delete your account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Data export (PDF)
          </CardTitle>
          <CardDescription>
            Download a PDF document containing all personal data we hold about your account,
            in compliance with the Nigeria Data Protection Regulation (NDPR).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={doExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download my data (PDF)
          </Button>
          {exportError && <div className="text-sm text-destructive">{exportError}</div>}
          {exportSuccess && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-sm">
                PDF downloaded successfully. Check your downloads folder for the file.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Delete account
          </CardTitle>
          <CardDescription>
            Permanent. Your PII will be anonymized. Financial/audit records are
            retained for legal/accounting reasons. You cannot delete if you
            have active projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Type: DELETE MY ACCOUNT</Label>
            <Input
              id="confirm"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwd">Current password (if password sign-in is set)</Label>
            <Input
              id="pwd"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          {deleteError && <div className="text-sm text-destructive">{deleteError}</div>}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={confirmPhrase !== "DELETE MY ACCOUNT" || deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Your account will be marked as
                  deleted, your PII anonymized, your sessions and authentication
                  credentials revoked. Financial and audit records will be
                  retained for legal/accounting reasons.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={doDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
