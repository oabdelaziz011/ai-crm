import { format, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import type { CalendarEvent, CalendarEventsByDay } from "@/lib/calendar/types/calendar-event";
import {
  CalendarMonthDayCell,
  useMonthKeyboardNavigation,
} from "@/components/calendar/views/month/calendar-month-day-cell";
import { useMonthGrid } from "@/hooks/calendar/use-month-grid";
import type { WeekdayIndex } from "@/lib/scheduling/types";
import { useTranslation } from "react-i18next";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type CalendarMonthViewProps = {
  eventsByDay: CalendarEventsByDay;
  anchorDate: string;
  weekStartDay: WeekdayIndex;
  displayTimezone: string;
  selectedDate?: string | null;
  selectedEventId?: string | null;
  onDayClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
};

export function CalendarMonthView({
  eventsByDay,
  anchorDate,
  weekStartDay,
  displayTimezone,
  selectedDate,
  selectedEventId,
  onDayClick,
  onEventClick,
}: CalendarMonthViewProps) {
  const { t } = useTranslation("common");
  const todayDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: displayTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [displayTimezone],
  );

  const { dayEvents } = useMonthGrid(
    anchorDate,
    weekStartDay,
    eventsByDay,
    todayDate,
    selectedDate,
  );

  const dates = useMemo(() => dayEvents.map((day) => day.cell.date), [dayEvents]);
  const [focusedDate, setFocusedDate] = useState(selectedDate ?? anchorDate);
  const handleKeyDown = useMonthKeyboardNavigation(dates, focusedDate, setFocusedDate);

  const weekdayOrder = useMemo(
    () => Array.from({ length: 7 }, (_, offset) => (weekStartDay + offset) % 7),
    [weekStartDay],
  );

  return (
    <div className="min-h-[640px]">
      <div className="grid grid-cols-7 border-b border-white/10 bg-black/20" role="row" aria-hidden>
        {weekdayOrder.map((dayIndex) => (
          <div
            key={dayIndex}
            className="px-2 py-2 text-center text-[10px] font-medium uppercase text-muted-foreground"
          >
            {t(`calendar.month.weekdays.${WEEKDAY_KEYS[dayIndex as WeekdayIndex]}`)}
          </div>
        ))}
      </div>
      <div
        role="grid"
        aria-label={t("calendar.month.gridLabel", {
          month: format(parseISO(`${anchorDate}T12:00:00`), "MMMM yyyy"),
        })}
        className="grid grid-cols-7"
        onKeyDown={handleKeyDown}
      >
        {dayEvents.map((day) => (
          <CalendarMonthDayCell
            key={day.cell.date}
            day={day}
            todayDate={todayDate}
            selectedDate={selectedDate}
            focusedDate={focusedDate}
            selectedEventId={selectedEventId}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
            onFocusDate={setFocusedDate}
            tabIndex={day.cell.date === focusedDate ? 0 : -1}
          />
        ))}
      </div>
    </div>
  );
}
