import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { TimelineResourceLaneLayout } from "@/lib/calendar/types/timeline-layout";
import { InteractiveCalendarEventBlock } from "@/components/calendar/interaction/interactive-calendar-event-block";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import { CalendarInteractionOverlay } from "@/components/calendar/interaction/calendar-interaction-overlay";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { cn } from "@/lib/utils";

type CalendarResourceColumnProps = {
  lane: TimelineResourceLaneLayout;
  eventsById: Map<string, CalendarEvent>;
  timeAxisWidth: number;
  timelineHourWidth: number;
  anchorDate: string;
  selectedEventId?: string | null;
  showResourceLabel?: boolean;
  resourceLabelWidth?: number;
  interaction?: CalendarGridInteractionProps;
};

export function CalendarResourceColumn({
  lane,
  eventsById,
  timeAxisWidth,
  timelineHourWidth,
  anchorDate,
  selectedEventId,
  showResourceLabel = true,
  resourceLabelWidth = 160,
  interaction,
}: CalendarResourceColumnProps) {
  const hours = getCalendarVisibleHours(CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR);
  const axisWidth = timeAxisWidth || hours.length * timelineHourWidth;
  const preview = interaction?.interactionState.preview;
  const showPreview =
    preview &&
    preview.date === anchorDate &&
    preview.resourceId === lane.resourceId;

  return (
    <div className="flex border-b border-border/60" style={{ minHeight: lane.laneHeightPx }}>
      {showResourceLabel && (
        <div
          className="shrink-0 border-r border-border/60 px-3 py-3 text-xs font-medium truncate"
          style={{ width: resourceLabelWidth }}
          title={lane.resourceName}
        >
          {lane.resourceName}
        </div>
      )}
      <div
        className="relative shrink-0"
        style={{ width: axisWidth, minHeight: lane.laneHeightPx }}
        role="gridcell"
      >
        <div className="absolute inset-0 flex pointer-events-none">
          {hours.map((hour) => (
            <div
              key={hour}
              className={cn("h-full border-r border-border/40")}
              style={{ width: timelineHourWidth }}
            />
          ))}
        </div>
        {lane.events.map((layout) => {
          const event = eventsById.get(layout.eventId);
          if (!event || interaction?.hiddenEventIds.has(event.id)) return null;
          return (
            <InteractiveCalendarEventBlock
              key={`${event.id}-${event.version}`}
              event={event}
              date={anchorDate}
              selected={selectedEventId === event.id}
              axis="horizontal"
              gridSizePx={axisWidth}
              handlers={interaction?.handlers}
              style={layout.style as CSSProperties}
            />
          );
        })}
        {showPreview && interaction && (
          <CalendarInteractionOverlay
            preview={interaction.interactionState.preview}
            axis="horizontal"
          />
        )}
      </div>
    </div>
  );
}
