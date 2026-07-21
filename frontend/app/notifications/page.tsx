import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const metadata = { title: "Notifications · CanoryAI" };

export default function NotificationsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Shipment processing, satellite alerts, and compliance events across your organization."
      />
      <NotificationsView />
    </PageContainer>
  );
}
