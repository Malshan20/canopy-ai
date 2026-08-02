import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SettingsSection } from "@/components/settings/settings-section";

interface UnavailableSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  reason: string;
}

/**
 * For Settings sub-sections with no backend support at all (API key
 * management, notification preferences, security settings, connected
 * services — none of these have a persisted table or endpoint yet). This
 * is deliberately different from the removed sidebar-level "Coming Soon"
 * placeholders: it's normal, honest product UX to show a genuinely
 * unbuilt *feature within an otherwise-real page* as unavailable, rather
 * than blocking navigation to the whole page or fabricating data to fill
 * the gap.
 */
export function UnavailableSection({ title, description, icon: Icon, reason }: UnavailableSectionProps) {
  return (
    <SettingsSection title={title} description={description}>
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <Badge variant="secondary" className="mb-1.5">
            Not yet available
          </Badge>
          <p className="text-sm text-muted-foreground">{reason}</p>
        </div>
      </div>
    </SettingsSection>
  );
}
