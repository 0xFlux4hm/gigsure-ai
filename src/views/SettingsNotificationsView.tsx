"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { Loader2, Check } from "lucide-react";

import { toast } from "sonner";
type Prefs = {
  preferredCurrency: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  aiFeatureDisclosure: boolean;
};

export function SettingsNotificationsView() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Prefs>("/api/settings").then(setPrefs).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/api/settings", prefs);
      setSaved(true);
      toast.success("Preferences saved", { description: "Your notification settings have been updated." });
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification preferences</h1>
        <p className="text-muted-foreground text-sm">Choose what we email and push to you.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Currency</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Preferred currency</Label>
            <Select value={prefs.preferredCurrency} onValueChange={(v) => setPrefs({ ...prefs, preferredCurrency: v })}>
              <SelectTrigger className="w-full md:w-1/2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="GHS">GHS — Ghanaian Cedi</SelectItem>
                <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                <SelectItem value="ZAR">ZAR — South African Rand</SelectItem>
                <SelectItem value="GBP">GBP — Pound Sterling</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Email notifications"
            desc="Essential service messages: contract changes, dispute updates, security alerts."
            checked={prefs.emailNotifications}
            onChange={(v) => setPrefs({ ...prefs, emailNotifications: v })}
          />
          <ToggleRow
            label="Push notifications"
            desc="In-app notifications rendered in the bell icon."
            checked={prefs.pushNotifications}
            onChange={(v) => setPrefs({ ...prefs, pushNotifications: v })}
          />
          <ToggleRow
            label="Marketing emails"
            desc="Optional. Product updates, surveys, news. Off by default."
            checked={prefs.marketingEmails}
            onChange={(v) => setPrefs({ ...prefs, marketingEmails: v })}
          />
          <ToggleRow
            label="AI feature disclosure"
            desc="Show clear labels when content is AI-generated."
            checked={prefs.aiFeatureDisclosure}
            onChange={(v) => setPrefs({ ...prefs, aiFeatureDisclosure: v })}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save preferences
        </Button>
        {saved && <span className="text-sm text-primary inline-flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
