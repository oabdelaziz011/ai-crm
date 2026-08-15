import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarAgendaEventRowProps = {
  event: CalendarEvent;
  selected?: boolean;
  onClick?: (event: CalendarEvent) => void;
  /** Reserved for future search highlighting. */
  searchQuery?: string;
};

/** Lightweight agenda list adapter — same CalendarEvent, mobile-first row UI. */
export function CalendarAgendaEventRow({
  event,
  selected,
  onClick,
}: CalendarAgendaEventRowProps) {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      aria-label={`${event.subtitle}, ${event.title}, ${event.displayStart} to ${event.displayEnd}`}
      onClick={() => onClick?.(event)}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        event.color.borderClass,
        selected && "ring-2 ring-primary/60 bg-muted/30",
      )}
    >
      <div className="w-14 shrink-0 text-xs font-mono text-muted-foreground pt-0.5">
        {event.displayStart}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("font-medium text-sm truncate", event.color.textClass)}>
          {event.subtitle}
        </div>
        <div className="text-xs text-muted-foreground truncate">{event.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>{event.displayEnd}</span>
          {event.resource?.name && <span>· {event.resource.name}</span>}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5",
              event.color.bgClass,
              event.color.borderClass,
            )}
          >
            {t(`calendar.status.${event.status}`)}
          </span>
        </div>
      </div>
    </button>
  );
}
