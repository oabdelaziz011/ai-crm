import { forwardRef, useMemo } from "react";
import {
  CalendarTimeGrid,
  CalendarTimeGridBody,
} from "@/components/calendar/shared/calendar-time-grid";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { cn } from "@/lib/utils";

type CalendarTimeGridScrollProps = {
  headerOffset?: number;
  hourRowHeight: number;
  startHour?: number;
  endHour?: number;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
  sidebar?: React.ReactNode;
};

export const CalendarTimeGridScroll = forwardRef<HTMLDivElement, CalendarTimeGridScrollProps>(
  function CalendarTimeGridScroll(
    {
      headerOffset = 0,
      hourRowHeight,
      startHour = CALENDAR_DAY_START_HOUR,
      endHour = CALENDAR_DAY_END_HOUR,
      className,
      bodyClassName,
      children,
      sidebar,
    },
    ref,
  ) {
    const hours = getCalendarVisibleHours(startHour, endHour);
    const gridHeight = hours.length * hourRowHeight + headerOffset;

    const hourStyle = useMemo(() => ({ height: hourRowHeight }), [hourRowHeight]);

    return (
      <div className={cn("grid min-h-[640px]", sidebar ? "grid-cols-[56px_1fr]" : "grid-cols-1", className)}>
        {sidebar ?? (
          <div className="border-r border-white/10">
            {headerOffset > 0 && (
              <div className="border-b border-white/10" style={{ height: headerOffset }} />
            )}
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-white/5 px-2 text-[10px] text-muted-foreground flex items-start pt-1"
                style={hourStyle}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        )}
        <div ref={ref} className="max-h-[640px] overflow-y-auto overflow-x-hidden">
          <div style={{ minHeight: gridHeight }} className={cn("relative", bodyClassName)}>
            {headerOffset > 0 && (
              <div className="border-b border-white/10" style={{ height: headerOffset }} />
            )}
            {hours.map((hour) => (
              <div key={hour} className="border-b border-white/5" style={hourStyle} />
            ))}
            {children}
          </div>
        </div>
      </div>
    );
  },
);

export { CalendarTimeGrid, CalendarTimeGridBody };
