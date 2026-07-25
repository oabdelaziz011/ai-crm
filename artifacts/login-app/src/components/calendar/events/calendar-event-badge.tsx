import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarEventBadgeProps = {
  event: CalendarEvent;
  selected?: boolean;
  onClick?: (event: CalendarEvent) => void;
  spanRole?: "single" | "multi-day-start" | "multi-day-middle" | "multi-day-end";
};

/** Lightweight month-view adapter — same CalendarEvent, compact badge UI. */
export function CalendarEventBadge({
  event,
  selected,
  onClick,
  spanRole = "single",
}: CalendarEventBadgeProps) {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      aria-label={`${event.subtitle}, ${event.title}, ${event.displayStart}`}
      data-span-role={spanRole}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick?.(event);
      }}
      className={cn(
        "w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        event.color.bgClass,
        event.color.borderClass,
        event.color.textClass,
        selected && "ring-2 ring-primary/60",
      )}
    >
      <span className="font-medium">{event.displayStart}</span> {event.subtitle}
      <span className="sr-only">{t(`calendar.status.${event.status}`)}</span>
    </button>
  );
}
