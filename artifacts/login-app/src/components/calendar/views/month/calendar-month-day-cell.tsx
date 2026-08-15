import { format, parseISO } from "date-fns";
import { useCallback } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { MonthDayEvents } from "@/hooks/calendar/use-month-grid";
import { CalendarEventBadge } from "@/components/calendar/events/calendar-event-badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarMonthDayCellProps = {
  day: MonthDayEvents;
  todayDate: string;
  selectedDate?: string | null;
  focusedDate?: string | null;
  selectedEventId?: string | null;
  onDayClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onFocusDate?: (date: string) => void;
  tabIndex?: number;
};

export function CalendarMonthDayCell({
  day,
  todayDate,
  selectedDate,
  focusedDate,
  selectedEventId,
  onDayClick,
  onEventClick,
  onFocusDate,
  tabIndex = -1,
}: CalendarMonthDayCellProps) {
  const { t } = useTranslation("common");
  const isToday = day.cell.date === todayDate;
  const isSelected = day.cell.date === selectedDate;
  const isFocused = day.cell.date === focusedDate;
  const dayNumber = format(parseISO(`${day.cell.date}T12:00:00`), "d");

  return (
    <button
      type="button"
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={t("calendar.month.dayLabel", {
        date: format(parseISO(`${day.cell.date}T12:00:00`), "MMMM d, yyyy"),
        count: day.events.length,
      })}
      aria-selected={isSelected}
      onClick={() => onDayClick?.(day.cell.date)}
      onFocus={() => onFocusDate?.(day.cell.date)}
      className={cn(
        "min-h-[108px] border-b border-e border-border bg-background p-1.5 text-start align-top transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60",
        !day.cell.inCurrentMonth && "text-muted-foreground/50",
        isToday && "bg-primary/5",
        isSelected && "ring-2 ring-inset ring-primary/40",
        isFocused && !isSelected && "bg-primary/5",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
            isToday && "bg-primary text-primary-foreground",
          )}
        >
          {dayNumber}
        </span>
      </div>
      <div className="space-y-0.5">
        {day.visibleEvents.map((event) => (
          <CalendarEventBadge
            key={`${event.id}-${event.version}`}
            event={event}
            selected={selectedEventId === event.id}
            onClick={onEventClick}
          />
        ))}
        {day.overflowCount > 0 && (
          <div className="px-1 text-[10px] text-muted-foreground">
            {t("calendar.month.moreEvents", { count: day.overflowCount })}
          </div>
        )}
      </div>
    </button>
  );
}

export function useMonthKeyboardNavigation(
  dates: string[],
  focusedDate: string,
  onFocusDate: (date: string) => void,
) {
  return useCallback(
    (event: React.KeyboardEvent) => {
      const index = dates.indexOf(focusedDate);
      if (index < 0) return;

      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = Math.min(dates.length - 1, index + 1);
      if (event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
      if (event.key === "ArrowDown") nextIndex = Math.min(dates.length - 1, index + 7);
      if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 7);
      if (event.key === "Home") nextIndex = index - (index % 7);
      if (event.key === "End") nextIndex = Math.min(dates.length - 1, index - (index % 7) + 6);

      if (nextIndex !== index) {
        event.preventDefault();
        onFocusDate(dates[nextIndex]);
      }
    },
    [dates, focusedDate, onFocusDate],
  );
}
