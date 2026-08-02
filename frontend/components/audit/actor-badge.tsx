import { Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { CANOPY_AI_ACTOR_NAME } from "@/constants/audit";

interface ActorBadgeProps {
  actor: string;
}

/**
 * Visually distinguishes AI-initiated events from human ones — a sparkles
 * icon and blue accent for CanoryAI itself, a plain user icon and neutral
 * styling for anyone/anything else (a user identifier, "System", a named
 * compliance officer, etc.).
 */
export function ActorBadge({ actor }: ActorBadgeProps) {
  const isCanoryAI = actor === CANOPY_AI_ACTOR_NAME;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        isCanoryAI ? "bg-info/10 text-info" : "bg-muted text-foreground",
      )}
    >
      {isCanoryAI ? (
        <Sparkles className="size-3.5" aria-hidden="true" />
      ) : (
        <User className="size-3.5" aria-hidden="true" />
      )}
      {actor}
    </span>
  );
}
