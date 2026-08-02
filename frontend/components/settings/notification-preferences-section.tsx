"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { fetchNotificationPreferences, updateNotificationPreferences } from "@/services/api";
import { SettingsSection } from "@/components/settings/settings-section";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationPreferences } from "@/types/organization";

const EVENT_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  {
    key: "email_on_shipment_completed",
    label: "Shipment processed",
    description: "A shipment finishes AI extraction and compliance checks.",
  },
  {
    key: "email_on_team_member_added",
    label: "Team member added",
    description: "Someone new joins your organization.",
  },
  {
    key: "email_on_team_member_removed",
    label: "Team member removed",
    description: "A member is removed from your organization.",
  },
  {
    key: "email_on_plan_changed",
    label: "Plan changed",
    description: "Your organization's subscription plan is updated.",
  },
];

/**
 * Every event here already creates an in-app notification unconditionally
 * (see the bell icon in the header) — these toggles control whether it
 * ALSO emails every member of the organization. Owner/admin-only on the
 * backend; a non-admin who somehow reaches this still just gets a clean
 * 403 toast rather than a client-side permission check duplicating what
 * the backend already enforces.
 */
export function NotificationPreferencesSection() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchNotificationPreferences().then((result) => {
      if (result.ok) setPreferences(result.data);
    });
  }, []);

  async function handleToggle(key: keyof NotificationPreferences, value: boolean) {
    if (!preferences) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingKey(key);

    const result = await updateNotificationPreferences(next);
    setSavingKey(null);

    if (!result.ok) {
      setPreferences(preferences);
      toast.error("Could not update preference", { description: result.error.message });
      return;
    }
    toast.success("Preference saved");
  }

  return (
    <SettingsSection title="Notification Preferences" description="Control which compliance events email your team.">
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>Every event below always appears in the notification bell — these toggles only control email.</span>
      </div>

      {preferences === null ? (
        <div className="space-y-3">
          {EVENT_LABELS.map((event) => (
            <Skeleton key={event.key} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {EVENT_LABELS.map((event) => (
            <li key={event.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{event.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {savingKey === event.key && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
                <Switch
                  checked={preferences[event.key]}
                  onCheckedChange={(checked) => handleToggle(event.key, checked)}
                  aria-label={`Email on ${event.label.toLowerCase()}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
