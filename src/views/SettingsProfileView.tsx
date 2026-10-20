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
import { Loader2, Check } from "lucide-react";

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

  useEffect(() => {
    Promise.all([
      api.get<{ displayName: string }>("/api/me"),
      api.get<Profile>("/api/profile"),
    ]).then(([u, p]) => {
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
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground text-sm">Public-facing info. All fields optional except display name.</p>
      </div>

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
