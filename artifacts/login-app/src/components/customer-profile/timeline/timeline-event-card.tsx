import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type TimelineEventCardProps = {
  title: string;
  description: string | null;
  actor: string | null;
  actorLabel?: string | null;
  icon: LucideIcon;
  accentClass: string;
  occurredAt: string;
  relativeTime: string;
  variant?: "default" | "workspace";
  actionLabel?: string;
  onAction?: () => void;
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
  variant = "default",
  actionLabel,
  onAction,
}: TimelineEventCardProps) {
  const isWorkspace = variant === "workspace";

  return (
    <li
      className={cn(
        "group rounded-xl border transition-colors",
        isWorkspace
          ? "border-border/60 bg-card/60 px-4 py-3 hover:border-primary/25 hover:bg-card/80"
          : "border-white/10 bg-background/20 px-3 py-2.5",
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg border",
            isWorkspace ? "size-9" : "mt-0.5 size-7 rounded-full",
            accentClass,
          )}
        >
          <Icon className={isWorkspace ? "size-4" : "size-3.5"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("font-semibold leading-snug", isWorkspace ? "text-sm" : "text-sm font-medium")}>{title}</p>
            <div className="shrink-0 text-end">
              <time className="block text-[10px] font-medium text-muted-foreground">{occurredAt}</time>
              <span className="text-[10px] text-muted-foreground/70">{relativeTime}</span>
            </div>
          </div>
          {actor && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{actorLabel ?? actor}</p>
          )}
          {description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">{description}</p>
          )}
          {isWorkspace && actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100"
            >
              {actionLabel}
              <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
