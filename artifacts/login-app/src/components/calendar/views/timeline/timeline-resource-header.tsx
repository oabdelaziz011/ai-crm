import { CalendarTimeAxis } from "@/components/calendar/shared/calendar-time-axis";
import {
  CALENDAR_TIMELINE_RESOURCE_LABEL_WIDTH_PX,
  getCalendarTimeAxisWidth,
} from "@/lib/calendar/constants/calendar-time-grid-config";

type TimelineResourceHeaderProps = {
  timeAxisWidth: number;
  timelineHourWidth?: number;
};

export function TimelineResourceHeader({
  timeAxisWidth,
  timelineHourWidth,
}: TimelineResourceHeaderProps) {
  const axisWidth = timeAxisWidth || getCalendarTimeAxisWidth();

  return (
    <div className="sticky top-0 z-20 flex bg-black/40 backdrop-blur-sm">
      <div
        className="shrink-0 border-r border-white/10 px-3 py-2 text-xs font-medium text-muted-foreground"
        style={{ width: CALENDAR_TIMELINE_RESOURCE_LABEL_WIDTH_PX }}
      />
      <div className="overflow-hidden" style={{ width: axisWidth }}>
        <CalendarTimeAxis hourWidthPx={timelineHourWidth} />
      </div>
    </div>
  );
}
