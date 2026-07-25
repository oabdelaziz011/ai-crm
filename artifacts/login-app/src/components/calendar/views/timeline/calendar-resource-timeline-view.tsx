import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { TimelineResourceRef } from "@/lib/calendar/types/timeline-layout";
import { TimelineResourceHeader } from "@/components/calendar/views/timeline/timeline-resource-header";
import { TimelineGrid } from "@/components/calendar/views/timeline/timeline-grid";
import { TimelineMobileUnavailable } from "@/components/calendar/views/timeline/timeline-mobile-unavailable";
import { CalendarEmptyState } from "@/components/calendar/overlays/calendar-empty-state";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import { useTimelineLayout } from "@/hooks/calendar/use-timeline-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";

type CalendarResourceTimelineViewProps = {
  events: CalendarEvent[];
  anchorDate: string;
  displayTimezone: string;
  resources: TimelineResourceRef[];
  timelineHourWidth: number;
  selectedEventId?: string | null;
  scrollNonce?: number;
  interaction?: CalendarGridInteractionProps;
  onCreateBooking?: () => void;
  canCreate?: boolean;
};

export function CalendarResourceTimelineView({
  events,
  anchorDate,
  displayTimezone,
  resources,
  timelineHourWidth,
  selectedEventId,
  scrollNonce = 0,
  interaction,
  onCreateBooking,
  canCreate,
}: CalendarResourceTimelineViewProps) {
  const isMobile = useIsMobile();
  const layout = useTimelineLayout(events, resources, anchorDate);
  const hours = getCalendarVisibleHours(CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR);
  const timeAxisWidth = hours.length * timelineHourWidth;

  if (isMobile) {
    return <TimelineMobileUnavailable />;
  }

  if (resources.length === 0) {
    return (
      <CalendarEmptyState onCreateBooking={onCreateBooking} canCreate={canCreate} />
    );
  }

  return (
    <div className="min-h-[640px]">
      <div className="overflow-x-auto">
        <div style={{ minWidth: timeAxisWidth + 160 }}>
          <TimelineResourceHeader timeAxisWidth={timeAxisWidth} timelineHourWidth={timelineHourWidth} />
          <TimelineGrid
            layout={{ ...layout, timeAxisWidthPx: timeAxisWidth }}
            events={events}
            anchorDate={anchorDate}
            displayTimezone={displayTimezone}
            timelineHourWidth={timelineHourWidth}
            selectedEventId={selectedEventId}
            scrollNonce={scrollNonce}
            interaction={interaction}
          />
        </div>
      </div>
    </div>
  );
}
