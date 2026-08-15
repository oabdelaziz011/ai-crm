import { addDays, format, parseISO } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { cn } from "@/lib/utils";

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
  const { i18n } = useTranslation("common");
  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;
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
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="grid shrink-0 border-b border-border bg-background"
        style={{ gridTemplateColumns: `56px repeat(${weekDates.length}, minmax(0, 1fr))` }}
      >
        <div style={{ height: WEEK_HEADER_HEIGHT }} />
        {weekDates.map((date) => {
          const isToday = date === today;
          return (
            <div
              key={`header-${date}`}
              className={cn(
                "border-s border-border px-2 py-2 text-center text-xs font-medium",
                isToday && "text-primary",
              )}
              style={{ height: WEEK_HEADER_HEIGHT }}
            >
              {format(parseISO(`${date}T12:00:00`), "EEE d", { locale: dateLocale })}
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `56px repeat(${weekDates.length}, minmax(0, 1fr))`,
            height: gridHeight,
          }}
          role="grid"
        >
          <div className="border-e border-border bg-background" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex items-start border-b border-border px-2 pt-1 text-[10px] text-muted-foreground"
                style={hourStyle}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {weekDates.map((date) => (
            <div
              key={date}
              className="relative border-s border-border bg-background"
              style={{ height: gridHeight }}
              onPointerEnter={() => interaction?.onTargetDateChange?.(date)}
              data-date={date}
            >
              {hours.map((hour) => (
                <div
                  key={`${date}-${hour}`}
                  className="pointer-events-none absolute inset-x-0 border-b border-border/70"
                  style={{
                    top: (hour - CALENDAR_DAY_START_HOUR) * hourRowHeight,
                    height: hourRowHeight,
                  }}
                />
              ))}
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
                    style={layoutEventInDayGrid(
                      event,
                      CALENDAR_DAY_START_HOUR,
                      CALENDAR_DAY_END_HOUR,
                      hourRowHeight,
                    )}
                  />
                ))}
              {previewDate === date && interaction && (
                <CalendarInteractionOverlay
                  preview={interaction.interactionState.preview}
                  axis="vertical"
                  hourRowHeight={hourRowHeight}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
