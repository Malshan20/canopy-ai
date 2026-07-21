"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { fetchOrganizationProfile, updateExportApprovalSetting } from "@/services/api";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrganizationProfile } from "@/types/organization";

/**
 * SSO is real infrastructure now (backend/app/services/sso_service.py),
 * but it's configured exclusively by CanoryAI staff via the separate
 * admin panel project — it needs a customer's actual SAML Identity
 * Provider metadata, which isn't something a self-serve toggle here
 * could meaningfully collect. This section is a genuine, live status
 * display, not a placeholder: it shows exactly what's configured for
 * your organization today, pulled from the same field the login page's
 * SSO routing actually reads.
 *
 * The export-approval toggle below it is a fully working control, not a
 * status display — see backend/app/api/v1/organizations.py's
 * update_export_approval_setting.
 *
 * Deliberately doesn't include a "session policies / IP allowlists"
 * placeholder — a card that only ever said "not built yet" added no
 * value once this section had two genuinely functional pieces sitting
 * next to it; better to just not mention a feature that doesn't exist
 * than clutter a working settings page with it.
 */
export function SecuritySettingsSection() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [isSavingExportApproval, setIsSavingExportApproval] = useState(false);

  useEffect(() => {
    fetchOrganizationProfile().then((result) => {
      if (result.ok) setProfile(result.data);
    });
  }, []);

  async function handleToggleExportApproval(checked: boolean) {
    if (!profile) return;
    setIsSavingExportApproval(true);
    const result = await updateExportApprovalSetting(checked);
    setIsSavingExportApproval(false);

    if (!result.ok) {
      toast.error("Could not update this setting", { description: result.error.message });
      return;
    }
    setProfile(result.data);
    toast.success(checked ? "Export sign-off requirement enabled" : "Export sign-off requirement disabled");
  }

  return (
    <SettingsSection title="Security Settings" description="SSO status and export controls for your organization.">
      {profile === null ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            {profile.sso_enabled ? (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Single Sign-On</p>
                <Badge variant={profile.sso_enabled ? "info" : "secondary"}>
                  {profile.sso_enabled ? "Active" : "Not configured"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {profile.sso_enabled ? (
                  <>
                    Members with a <span className="font-medium text-foreground">@{profile.sso_domain}</span> email
                    sign in through your identity provider automatically.
                  </>
                ) : (
                  "Enterprise customers can sign in through their own identity provider (Okta, Azure AD, Google Workspace, etc). Contact your CanoryAI account team to set this up."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Require sign-off before XML export</p>
                <div className="flex items-center gap-2">
                  {isSavingExportApproval && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
                  <Switch
                    checked={profile.require_export_approval}
                    onCheckedChange={handleToggleExportApproval}
                    disabled={isSavingExportApproval}
                    aria-label="Require sign-off before XML export"
                  />
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                When on, an owner, admin, or compliance manager must explicitly approve a shipment
                before its DDS XML can be downloaded — a deliberate extra check for a document with
                real regulatory consequences. On by default for every new organization.
              </p>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
