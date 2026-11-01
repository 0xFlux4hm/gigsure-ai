"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Building2,
  Plus,
  Trash2,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Banknote,
  ArrowDownToLine,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { useNav } from "@/lib/nav";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/page-components";

type BankOption = {
  code: string;
  name: string;
  shortName?: string;
};

type BankDetail = {
  id: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  currency: string;
  isDefault: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

type Payout = {
  id: string;
  payoutReference: string;
  projectTitle: string;
  milestoneTitle?: string;
  payee: { id: string; displayName: string; email: string };
  initiatedBy: { id: string; displayName: string };
  provider: string;
  amountMinor: number;
  netMinor: number;
  currency: string;
  status: string;
  failureReason?: string;
  initiatedAt: string;
  settledAt: string | null;
  failedAt: string | null;
};

function formatMinor(minor: number, currency = "NGN"): string {
  const major = minor / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    PENDING: { variant: "secondary", label: "Pending" },
    SUCCEEDED: { variant: "default", label: "Succeeded" },
    FAILED: { variant: "destructive", label: "Failed" },
    REVERSED: { variant: "outline", label: "Reversed" },
  };
  const config = map[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function SettingsPayoutsView() {
  const [bankDetails, setBankDetails] = useState<BankDetail[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAccount, setAddingAccount] = useState(false);
  const [formState, setFormState] = useState({
    accountName: "",
    accountNumber: "",
    bankCode: "",
    bankName: "",
    isDefault: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { navigate } = useNav();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [banksRes, detailsRes, payoutsRes] = await Promise.all([
        api.get<{ banks: BankOption[] }>("/api/banks"),
        api.get<{ bankDetails: BankDetail[] }>("/api/users/me/bank-details"),
        api.get<{ payouts: Payout[] }>("/api/payouts?limit=20"),
      ]);
      setBanks(banksRes.banks);
      setBankDetails(detailsRes.bankDetails);
      setPayouts(payoutsRes.payouts);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to load payout information");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleBankChange(bankCode: string) {
    const bank = banks.find((b) => b.code === bankCode);
    setFormState((s) => ({
      ...s,
      bankCode,
      bankName: bank?.name ?? "",
    }));
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!/^\d{10}$/.test(formState.accountNumber)) {
      setError("Account number must be exactly 10 digits.");
      return;
    }
    if (formState.accountName.trim().length < 2) {
      setError("Account name is too short.");
      return;
    }
    if (!formState.bankCode) {
      setError("Please select a bank.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<{ bankDetail: BankDetail; message: string }>(
        "/api/users/me/bank-details",
        formState,
      );
      setSuccess(result.message);
      setFormState({
        accountName: "",
        accountNumber: "",
        bankCode: "",
        bankName: "",
        isDefault: bankDetails.length === 0,
      });
      setAddingAccount(false);
      await loadData();
    } catch (err) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message ?? "Failed to add bank account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await api.patch(`/api/users/me/bank-details/${id}`, { isDefault: true });
      await loadData();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to set default account.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this bank account? You'll need to re-add it before receiving payouts.")) return;
    try {
      await api.del(`/api/users/me/bank-details/${id}`);
      await loadData();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to remove bank account.");
    }
  }

  const kycPending = !loading && bankDetails.length === 0;

  return (
    <div className="container max-w-5xl py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      <PageHeader
        title="Payouts"
        description="Manage the bank accounts where you receive project payouts, and track your payout history."
        icon={Banknote}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button className="ml-auto text-destructive" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{success}</span>
          <button className="ml-auto" onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Bank accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Payout bank accounts
            </CardTitle>
            <CardDescription className="mt-1">
              Add the bank account where you want to receive project payouts.
              Account name should match your KYC name to pass name-enquiry verification.
            </CardDescription>
          </div>
          <Dialog open={addingAccount} onOpenChange={setAddingAccount}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Add account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add payout bank account</DialogTitle>
                <DialogDescription>
                  We&apos;ll verify the account name against the bank to confirm you own it.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddAccount} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account name</Label>
                  <Input
                    id="accountName"
                    value={formState.accountName}
                    onChange={(e) => setFormState((s) => ({ ...s, accountName: e.target.value }))}
                    placeholder="e.g., Adaeze Okafor"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account number (10 digits)</Label>
                  <Input
                    id="accountNumber"
                    value={formState.accountNumber}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                    placeholder="0123456789"
                    inputMode="numeric"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank">Bank</Label>
                  <Select value={formState.bankCode} onValueChange={handleBankChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formState.isDefault}
                    onChange={(e) => setFormState((s) => ({ ...s, isDefault: e.target.checked }))}
                    className="rounded"
                  />
                  Set as default payout account
                </label>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddingAccount(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Add account
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading bank accounts…" />
          ) : bankDetails.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No bank account on file yet"
              description={
                "You need at least one bank account to receive payouts." +
                (kycPending ? " KYC verification is required before adding a bank account." : "")
              }
              action={
                <Button variant="outline" onClick={() => navigate({ view: "kyc" })}>
                  {kycPending ? "Verify identity first" : "Add account"}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {bankDetails.map((bd) => (
                <div
                  key={bd.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/30 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{bd.bankName}</span>
                      {bd.isDefault && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1" /> Default
                        </Badge>
                      )}
                      {bd.isVerified ? (
                        <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-500/40 bg-emerald-500/10">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Unverified
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono">{bd.accountNumber}</span>
                      <span className="mx-2">·</span>
                      <span>{bd.accountName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Added {formatDate(bd.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!bd.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetDefault(bd.id)}
                      >
                        Set default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(bd.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5" /> Payout history
          </CardTitle>
          <CardDescription>
            Recent payouts to your bank accounts. Funds are released after a milestone is approved
            and the project owner confirms the release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading payout history…" />
          ) : payouts.length === 0 ? (
            <EmptyState
              icon={ArrowDownToLine}
              title="No payouts yet"
              description="When a project owner releases an approved milestone, your payout will appear here."
            />
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between p-3 border rounded hover:bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatMinor(p.netMinor, p.currency)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {p.projectTitle}
                      {p.milestoneTitle && ` · ${p.milestoneTitle}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Via {p.provider} · {formatDate(p.initiatedAt)}
                      {p.settledAt && ` · settled ${formatDate(p.settledAt)}`}
                    </div>
                    {p.failureReason && (
                      <div className="text-xs text-destructive mt-1">{p.failureReason}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
