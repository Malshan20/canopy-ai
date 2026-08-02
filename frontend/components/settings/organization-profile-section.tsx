import { Building2 } from "lucide-react";

import { serverFetchJson } from "@/lib/server-api";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { formatDate, formatDemoCountdown } from "@/lib/utils";
import type { OrganizationProfile } from "@/types/organization";

const PLAN_LABEL: Record<string, string> = {
  growth: "Growth",
  enterprise: "Enterprise",
  custom: "Custom",
  demo: "Demo",
};

export async function OrganizationProfileSection() {
  const profile = await serverFetchJson<OrganizationProfile>("/api/v1/organizations/me");

  return (
    <SettingsSection title="Organization Profile" description="Your workspace's core identity.">
      {profile === null ? (
        <p className="text-sm text-muted-foreground">Could not load organization details right now.</p>
      ) : (
        <>
          {profile.plan === "demo" && (
            <Alert variant="warning" className="mb-5">
              <AlertTitle>You&apos;re on a demo workspace</AlertTitle>
              <AlertDescription>
                {formatDemoCountdown(profile.demo_expires_at) ?? "Full features, limited volume."} — every
                document, satellite check, and export works at full strength, capped at a small volume so
                you can see it run on your own data. Reach out before it ends if you&apos;d like to
                continue on a full plan.
              </AlertDescription>
            </Alert>
          )}
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 sm:col-span-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                <Building2 className="size-4.5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Organization name</dt>
                <dd className="font-semibold text-foreground">{profile.name}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5">
                <Badge variant={profile.plan === "demo" ? "warning" : "secondary"}>
                  {PLAN_LABEL[profile.plan] ?? profile.plan}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Members</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{profile.member_count}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{formatDate(profile.created_at)}</dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-border pt-5">
            <div className="flex items-baseline justify-between">
              <dt className="text-xs text-muted-foreground">Shipments used this year</dt>
              <dd className="text-xs font-medium text-foreground">
                {profile.shipments_used_this_year}
                {profile.shipment_limit !== null ? ` / ${profile.shipment_limit}` : " (unlimited)"}
              </dd>
            </div>
            {profile.shipment_limit !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (profile.shipments_used_this_year / profile.shipment_limit) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </SettingsSection>
  );
}
