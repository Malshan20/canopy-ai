import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { OrganizationProfileSection } from "@/components/settings/organization-profile-section";
import { TeamMembersSection } from "@/components/settings/team-members-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { WebhooksSection } from "@/components/settings/webhooks-section";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences-section";
import { SecuritySettingsSection } from "@/components/settings/security-settings-section";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Organization configuration and workspace management." />

      <div className="space-y-4">
        <OrganizationProfileSection />
        <TeamMembersSection />
        <ApiKeysSection />
        <WebhooksSection />
        <NotificationPreferencesSection />
        <SecuritySettingsSection />
      </div>
    </PageContainer>
  );
}
