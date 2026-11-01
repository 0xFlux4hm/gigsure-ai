"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";
import { useNav } from "@/lib/nav";
import { Loader2, Check, X, ShieldCheck, Mail, Building2, User } from "lucide-react";

import { toast } from "sonner";
import { PageHeader, LoadingState } from "@/components/shared/page-components";
type Profile = {
  headline: string | null;
  bio: string | null;
  country: string | null;
  region: string | null;
  preferredLanguage: string;
  timezone: string;
  professionalRole: string | null;
  skills: string;
  specialization: string | null;
  portfolioLinks: string;
  availability: string;
  preferredCategories: string;
  profileVisibility: string;
};

export function SettingsProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completion, setCompletion] = useState<{
    emailVerified: boolean;
    kycVerified: boolean;
    bankAccountAdded: boolean;
    profileFilled: boolean;
  }>({ emailVerified: false, kycVerified: false, bankAccountAdded: false, profileFilled: false });
  const { navigate } = useNav();

  useEffect(() => {
    Promise.all([
      api.get<{ displayName: string; emailVerifiedAt?: string }>("/api/me"),
      api.get<Profile>("/api/profile"),
      api.get<{ kycVerified: boolean; bankAccountAdded: boolean }>("/api/dashboard").catch(() => ({ kycVerified: false, bankAccountAdded: false })),
    ]).then(([u, p, d]) => {
      setDisplayName(u.displayName);
      // Handle case where profile doesn't exist yet
      setProfile({
        headline: p?.headline ?? null,
        bio: p?.bio ?? null,
        country: p?.country ?? null,
        region: p?.region ?? null,
        preferredLanguage: p?.preferredLanguage ?? "en",
        timezone: p?.timezone ?? "Africa/Lagos",
        professionalRole: p?.professionalRole ?? null,
        skills: p?.skills ?? "[]",
        specialization: p?.specialization ?? null,
        portfolioLinks: p?.portfolioLinks ?? "[]",
        availability: p?.availability ?? "OPEN",
        preferredCategories: p?.preferredCategories ?? "[]",
        profileVisibility: p?.profileVisibility ?? "PRIVATE",
      });
      setCompletion({
        emailVerified: !!u.emailVerifiedAt,
        kycVerified: d.kycVerified,
        bankAccountAdded: d.bankAccountAdded,
        profileFilled: !!(p?.headline && p?.skills && p?.skills !== "[]"),
      });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/api/profile", {
        displayName,
        ...profile,
        skills: JSON.parse(profile.skills || "[]"),
        portfolioLinks: JSON.parse(profile.portfolioLinks || "[]"),
        preferredCategories: JSON.parse(profile.preferredCategories || "[]"),
      });
      setSaved(true);
      toast.success("Profile saved", { description: "Your changes have been updated." });
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return <LoadingState label="Loading profile…" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Public-facing info. All fields optional except display name."
        icon={User}
      />

      {/* Profile completion card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Setup Progress</CardTitle>
          <CardDescription>
            Complete these steps to unlock all platform features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CompletionItem
              done={completion.emailVerified}
              icon={Mail}
              label="Email verified"
              actionLabel="Resend"
              onAction={() => navigate({ view: "resend-verification" })}
            />
            <CompletionItem
              done={completion.kycVerified}
              icon={ShieldCheck}
              label="KYC verified (NIN + selfie)"
              actionLabel="Verify"
              onAction={() => navigate({ view: "kyc" })}
            />
            <CompletionItem
              done={completion.bankAccountAdded}
              icon={Building2}
              label="Bank account added"
              actionLabel="Add"
              onAction={() => navigate({ view: "settings-payouts" })}
            />
            <CompletionItem
              done={completion.profileFilled}
              icon={User}
              label="Profile completed (headline + skills)"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Basic info</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Headline</Label>
            <Input
              value={profile.headline ?? ""}
              onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
              placeholder="Senior Frontend Developer"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea
              value={profile.bio ?? ""}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              rows={4}
              placeholder="Brief professional bio"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Location &amp; language</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input
              value={profile.country ?? ""}
              onChange={(e) => setProfile({ ...profile, country: e.target.value })}
              placeholder="Nigeria"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Region</Label>
            <Input
              value={profile.region ?? ""}
              onChange={(e) => setProfile({ ...profile, region: e.target.value })}
              placeholder="Lagos"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Preferred language</Label>
            <Input value={profile.preferredLanguage} onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Professional info</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Professional role</Label>
            <Input
              value={profile.professionalRole ?? ""}
              onChange={(e) => setProfile({ ...profile, professionalRole: e.target.value })}
              placeholder="Software Developer"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Skills (comma-separated)</Label>
            <Input
              value={(JSON.parse(profile.skills || "[]") as string[]).join(", ")}
              onChange={(e) => setProfile({ ...profile, skills: JSON.stringify(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)) })}
              placeholder="React, TypeScript, Node.js"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Specialization</Label>
            <Input
              value={profile.specialization ?? ""}
              onChange={(e) => setProfile({ ...profile, specialization: e.target.value })}
              placeholder="SaaS dashboards, fintech"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Portfolio links (one per line)</Label>
            <Textarea
              value={(JSON.parse(profile.portfolioLinks || "[]") as string[]).join("\n")}
              onChange={(e) => setProfile({ ...profile, portfolioLinks: JSON.stringify(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)) })}
              rows={3}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Availability</Label>
              <Select value={profile.availability} onValueChange={(v) => setProfile({ ...profile, availability: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open to work</SelectItem>
                  <SelectItem value="BUSY">Busy</SelectItem>
                  <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Profile visibility</Label>
              <Select value={profile.profileVisibility} onValueChange={(v) => setProfile({ ...profile, profileVisibility: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Private (only you)</SelectItem>
                  <SelectItem value="TEAM">Team (project members only)</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save changes
        </Button>
        {saved && (
          <span className="text-sm text-primary inline-flex items-center gap-1">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

function CompletionItem({
  done,
  icon: Icon,
  label,
  actionLabel,
  onAction,
}: {
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <span className={`text-sm flex-1 ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      {!done && actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
