import { useMemo, useRef } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { layoutEventInDayGrid } from "@/lib/calendar/layout/day-grid-layout";
import { CalendarEmptyState } from "@/components/calendar/overlays/calendar-empty-state";
import { CalendarInteractionOverlay } from "@/components/calendar/interaction/calendar-interaction-overlay";
import { CalendarNowIndicator } from "@/components/calendar/interaction/calendar-now-indicator";
import { InteractiveCalendarEventBlock } from "@/components/calendar/interaction/interactive-calendar-event-block";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import { CalendarTimeGridScroll } from "@/components/calendar/shared/calendar-time-grid-scroll";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { useNowIndicator } from "@/hooks/calendar/use-now-indicator";

type CalendarDayViewProps = {
  events: CalendarEvent[];
  anchorDate: string;
  displayTimezone: string;
  selectedEventId?: string | null;
  hourRowHeight: number;
  scrollNonce?: number;
  interaction?: CalendarGridInteractionProps;
  onCreateBooking?: () => void;
  canCreate?: boolean;
};

export function CalendarDayView({
  events,
  anchorDate,
  displayTimezone,
  selectedEventId,
  hourRowHeight,
  scrollNonce = 0,
  interaction,
  onCreateBooking,
  canCreate,
}: CalendarDayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayEvents = useMemo(
    () => events.filter((event) => event.displayDate === anchorDate),
    [events, anchorDate],
  );

  const hours = getCalendarVisibleHours(CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR);
  const gridHeight = hours.length * hourRowHeight;
  const { nowPercent } = useNowIndicator(
    displayTimezone,
    anchorDate,
    gridHeight,
    scrollRef,
    CALENDAR_DAY_START_HOUR,
    CALENDAR_DAY_END_HOUR,
    scrollNonce,
  );

  if (dayEvents.length === 0 && !canCreate) {
    return <CalendarEmptyState onCreateBooking={onCreateBooking} canCreate={canCreate} />;
  }

  return (
    <CalendarTimeGridScroll
      ref={scrollRef}
      hourRowHeight={hourRowHeight}
      bodyClassName="min-h-full"
    >
      <CalendarNowIndicator percent={nowPercent} />
      {dayEvents
        .filter((event) => !interaction?.hiddenEventIds.has(event.id))
        .map((event) => (
          <InteractiveCalendarEventBlock
            key={`${event.id}-${event.version}`}
            event={event}
            date={anchorDate}
            selected={selectedEventId === event.id}
            gridSizePx={gridHeight}
            axis="vertical"
            handlers={interaction?.handlers}
            style={{
              ...layoutEventInDayGrid(event, CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR),
              left: 4,
              right: 4,
            }}
          />
        ))}
      {interaction && (
        <CalendarInteractionOverlay
          preview={interaction.interactionState.preview}
          axis="vertical"
        />
      )}
    </CalendarTimeGridScroll>
  );
}
