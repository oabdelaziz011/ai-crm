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
  const compact = (event.durationMinutes ?? 0) < 35;

  return (
    <button
      type="button"
      aria-label={`${event.subtitle}, ${event.title}, ${event.displayStart}`}
      title={`${event.subtitle} · ${event.title} · ${event.resource?.name ?? ""} · ${event.displayStart}–${event.displayEnd}`}
      onClick={(nativeEvent) => onClick?.(event, nativeEvent)}
      style={style}
      className={cn(
        "absolute inset-x-0 box-border overflow-hidden rounded-md border border-s-4 px-1.5 text-start shadow-sm transition-colors hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        compact ? "py-0.5" : "py-1",
        event.color.bgClass,
        event.color.borderClass,
        event.color.accentClass,
        selected && "ring-2 ring-primary/60",
      )}
    >
      <div className={cn("truncate text-[11px] font-semibold leading-tight", event.color.textClass)}>
        {event.subtitle}
      </div>
      {!compact ? (
        <>
          <div className="truncate text-[10px] leading-tight opacity-80">{event.title}</div>
          <div className="truncate text-[10px] leading-tight opacity-70">
            {event.displayStart} – {event.displayEnd}
          </div>
        </>
      ) : (
        <div className="truncate text-[10px] leading-tight opacity-70">{event.displayStart}</div>
      )}
      <div className="sr-only">{t(`calendar.status.${event.status}`)}</div>
    </button>
  );
}

export { computeDayGridLayout as layoutEventInDayGrid };
