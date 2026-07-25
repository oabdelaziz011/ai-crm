import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_HOUR_ROW_HEIGHT_PX,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { cn } from "@/lib/utils";

type CalendarTimeGridProps = {
  headerOffset?: number;
  className?: string;
  startHour?: number;
  endHour?: number;
};

/** Vertical hour labels + row guides (Day / Week views). */
export function CalendarTimeGrid({
  headerOffset = 0,
  className,
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
}: CalendarTimeGridProps) {
  const hours = getCalendarVisibleHours(startHour, endHour);

  return (
    <div className={cn("border-r border-white/10", className)}>
      {headerOffset > 0 && (
        <div className="border-b border-white/10" style={{ height: headerOffset }} />
      )}
      {hours.map((hour) => (
        <div
          key={hour}
          className="border-b border-white/5 px-2 text-[10px] text-muted-foreground flex items-start pt-1"
          style={{ height: CALENDAR_HOUR_ROW_HEIGHT_PX }}
        >
          {String(hour).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

type CalendarTimeGridBodyProps = {
  headerOffset?: number;
  className?: string;
  children?: React.ReactNode;
  startHour?: number;
  endHour?: number;
};

/** Hour row guides for the event placement area (Day / Week views). */
export function CalendarTimeGridBody({
  headerOffset = 0,
  className,
  children,
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
}: CalendarTimeGridBodyProps) {
  const hours = getCalendarVisibleHours(startHour, endHour);

  return (
    <div className={cn("relative", className)}>
      {headerOffset > 0 && (
        <div className="border-b border-white/10" style={{ height: headerOffset }} />
      )}
      {hours.map((hour) => (
        <div
          key={hour}
          className="border-b border-white/5"
          style={{ height: CALENDAR_HOUR_ROW_HEIGHT_PX }}
        />
      ))}
      {children}
    </div>
  );
}

export { getCalendarTimeGridHeight } from "@/lib/calendar/constants/calendar-time-grid-config";
