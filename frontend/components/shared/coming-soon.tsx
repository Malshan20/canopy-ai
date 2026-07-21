import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import { Badge } from "@/components/ui/badge";

interface ComingSoonProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

/**
 * Professional placeholder for sidebar destinations that are wired into
 * navigation ahead of their real implementation. Communicates what the
 * page will do, not just that it's missing.
 */
export function ComingSoon({ title, description, icon: Icon = Construction }: ComingSoonProps) {
  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-20 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-xl bg-accent">
          <Icon className="size-6 text-primary" aria-hidden="true" />
        </div>
        <Badge variant="secondary" className="mb-3">
          Coming soon
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </PageContainer>
  );
}
