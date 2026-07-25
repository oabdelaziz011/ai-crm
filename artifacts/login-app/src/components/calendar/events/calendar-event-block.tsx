import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { layoutEventInDayGrid as computeDayGridLayout } from "@/lib/calendar/layout/day-grid-layout";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarEventBlockProps = {
  event: CalendarEvent;
  selected?: boolean;
  style?: CSSProperties;
  onClick?: (event: CalendarEvent, nativeEvent?: React.MouseEvent<HTMLButtonElement>) => void;
};

export function CalendarEventBlock({
  event,
  selected,
  style,
  onClick,
}: CalendarEventBlockProps) {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      aria-label={`${event.subtitle}, ${event.title}, ${event.displayStart}`}
      title={`${event.subtitle} · ${event.title} · ${event.resource?.name ?? ""}`}
      onClick={(nativeEvent) => onClick?.(event, nativeEvent)}
      style={style}
      className={cn(
        "absolute overflow-hidden rounded-md border border-l-4 px-2 py-1 text-left text-xs transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        event.color.bgClass,
        event.color.borderClass,
        event.color.accentClass,
        selected && "ring-2 ring-primary/60",
      )}
    >
      <div className={cn("font-medium truncate", event.color.textClass)}>{event.subtitle}</div>
      <div className="truncate text-[10px] opacity-80">{event.title}</div>
      <div className="text-[10px] opacity-70">
        {event.displayStart} – {event.displayEnd}
      </div>
      <div className="sr-only">{t(`calendar.status.${event.status}`)}</div>
    </button>
  );
}

export { computeDayGridLayout as layoutEventInDayGrid };
