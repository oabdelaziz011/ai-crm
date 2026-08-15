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
      <div ref={ref} className={cn("h-full min-h-0 overflow-y-auto overflow-x-hidden", className)}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "56px minmax(0, 1fr)",
            height: gridHeight,
          }}
        >
          <div className="border-e border-border bg-background" style={{ height: gridHeight }}>
            {headerOffset > 0 && (
              <div className="border-b border-border" style={{ height: headerOffset }} />
            )}
            {sidebar ??
              hours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start border-b border-border px-2 pt-1 text-[10px] text-muted-foreground"
                  style={hourStyle}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
          </div>
          <div
            style={{ height: gridHeight }}
            className={cn("relative border-s border-border bg-background", bodyClassName)}
          >
            {headerOffset > 0 && (
              <div className="border-b border-border" style={{ height: headerOffset }} />
            )}
            {hours.map((hour) => (
              <div
                key={hour}
                className="pointer-events-none absolute inset-x-0 border-b border-border/70"
                style={{
                  top: headerOffset + (hour - startHour) * hourRowHeight,
                  height: hourRowHeight,
                }}
              />
            ))}
            {children}
          </div>
        </div>
      </div>
    );
  },
);

export { CalendarTimeGrid, CalendarTimeGridBody };
