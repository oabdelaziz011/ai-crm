import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_TIMELINE_HOUR_WIDTH_PX,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { cn } from "@/lib/utils";

type CalendarTimeAxisProps = {
  className?: string;
  startHour?: number;
  endHour?: number;
  hourWidthPx?: number;
};

/** Horizontal hour labels for Timeline view (time flows left → right). */
export function CalendarTimeAxis({
  className,
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
  hourWidthPx = CALENDAR_TIMELINE_HOUR_WIDTH_PX,
}: CalendarTimeAxisProps) {
  const hours = getCalendarVisibleHours(startHour, endHour);

  return (
    <div
      className={cn("flex border-b border-border/60", className)}
      style={{ minWidth: hours.length * hourWidthPx }}
      role="row"
    >
      {hours.map((hour) => (
        <div
          key={hour}
          className="shrink-0 border-r border-border/40 px-2 py-2 text-[10px] text-muted-foreground"
          style={{ width: hourWidthPx }}
        >
          {String(hour).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

export { getCalendarTimeAxisWidth } from "@/lib/calendar/constants/calendar-time-grid-config";
