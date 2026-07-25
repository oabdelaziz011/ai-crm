import { addDays, format, parseISO } from "date-fns";
import { useMemo, useRef } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { layoutEventInDayGrid } from "@/lib/calendar/layout/day-grid-layout";
import { CalendarEmptyState } from "@/components/calendar/overlays/calendar-empty-state";
import { CalendarInteractionOverlay } from "@/components/calendar/interaction/calendar-interaction-overlay";
import { CalendarNowIndicator } from "@/components/calendar/interaction/calendar-now-indicator";
import { InteractiveCalendarEventBlock } from "@/components/calendar/interaction/interactive-calendar-event-block";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";
import { useNowIndicator } from "@/hooks/calendar/use-now-indicator";
import { nowService } from "@/hooks/calendar/use-now-indicator";

const WEEK_HEADER_HEIGHT = 40;

type CalendarWeekViewProps = {
  events: CalendarEvent[];
  startDate: string;
  endDate: string;
  weekStartDay: number;
  displayTimezone: string;
  selectedEventId?: string | null;
  hourRowHeight: number;
  scrollNonce?: number;
  interaction?: CalendarGridInteractionProps;
  onCreateBooking?: () => void;
  canCreate?: boolean;
};

function buildWeekDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = parseISO(`${startDate}T12:00:00`);
  const end = parseISO(`${endDate}T12:00:00`);
  while (cursor <= end) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function CalendarWeekView({
  events,
  startDate,
  endDate,
  displayTimezone,
  selectedEventId,
  hourRowHeight,
  scrollNonce = 0,
  interaction,
  onCreateBooking,
  canCreate,
}: CalendarWeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDates = useMemo(
    () => buildWeekDates(startDate, endDate),
    [startDate, endDate],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const date of weekDates) {
      map.set(
        date,
        events.filter((event) => event.displayDate === date),
      );
    }
    return map;
  }, [events, weekDates]);

  const hours = getCalendarVisibleHours(CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR);
  const gridHeight = hours.length * hourRowHeight;
  const hourStyle = useMemo(() => ({ height: hourRowHeight }), [hourRowHeight]);
  const today = nowService.localToday(displayTimezone);

  const { nowPercent } = useNowIndicator(
    displayTimezone,
    today,
    gridHeight,
    scrollRef,
    CALENDAR_DAY_START_HOUR,
    CALENDAR_DAY_END_HOUR,
    scrollNonce,
  );

  const hasEvents = events.some((event) => weekDates.includes(event.displayDate));
  const previewDate = interaction?.interactionState.preview?.date ?? null;

  if (!hasEvents && !canCreate) {
    return (
      <CalendarEmptyState onCreateBooking={onCreateBooking} canCreate={canCreate} />
    );
  }

  return (
    <div className="min-h-[640px]">
      <div
        className="grid border-b border-white/10"
        style={{ gridTemplateColumns: `56px repeat(${weekDates.length}, minmax(0, 1fr))` }}
      >
        <div style={{ height: WEEK_HEADER_HEIGHT }} />
        {weekDates.map((date) => (
          <div
            key={`header-${date}`}
            className="border-l border-white/10 px-2 py-2 text-center text-xs font-medium"
            style={{ height: WEEK_HEADER_HEIGHT }}
          >
            {format(parseISO(`${date}T12:00:00`), "EEE d")}
          </div>
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: `56px minmax(0, 1fr)` }}
      >
        <div className="border-r border-white/10">
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

        <div ref={scrollRef} className="max-h-[640px] overflow-y-auto overflow-x-hidden">
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${weekDates.length}, minmax(0, 1fr))`,
              minHeight: gridHeight,
            }}
            role="grid"
          >
            {weekDates.map((date) => (
              <div
                key={date}
                className="relative border-l border-white/10"
                onPointerEnter={() => interaction?.onTargetDateChange?.(date)}
                data-date={date}
              >
                {date === today && <CalendarNowIndicator percent={nowPercent} />}
                {(eventsByDate.get(date) ?? [])
                  .filter((event) => !interaction?.hiddenEventIds.has(event.id))
                  .map((event) => (
                    <InteractiveCalendarEventBlock
                      key={`${event.id}-${event.version}`}
                      event={event}
                      date={date}
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
                {previewDate === date && interaction && (
                  <CalendarInteractionOverlay
                    preview={interaction.interactionState.preview}
                    axis="vertical"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
