import type { LucideIcon } from "lucide-react";

type TimelineEventCardProps = {
  title: string;
  description: string | null;
  actor: string | null;
  actorLabel?: string | null;
  icon: LucideIcon;
  accentClass: string;
  occurredAt: string;
  relativeTime: string;
};

export function TimelineEventCard({
  title,
  description,
  actor,
  actorLabel,
  icon: Icon,
  accentClass,
  occurredAt,
  relativeTime,
}: TimelineEventCardProps) {
  return (
    <li className="rounded-lg border border-white/10 bg-background/20 px-3 py-2.5">
      <div className="flex gap-3">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${accentClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{title}</p>
            <div className="text-end shrink-0">
              <time className="text-[10px] text-muted-foreground block">{occurredAt}</time>
              <span className="text-[10px] text-muted-foreground/80">{relativeTime}</span>
            </div>
          </div>
          {actor && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {actorLabel ?? actor}
            </p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground/90 mt-1 leading-relaxed line-clamp-3">
              {description}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
