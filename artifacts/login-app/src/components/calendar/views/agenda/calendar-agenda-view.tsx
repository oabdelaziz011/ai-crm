import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarEvent, CalendarEventsByDay } from "@/lib/calendar/types/calendar-event";
import { CalendarAgendaDayGroup } from "@/components/calendar/views/agenda/calendar-agenda-day-group";
import { useAgendaGroups } from "@/hooks/calendar/use-agenda-groups";
import { useVirtualAgendaList } from "@/hooks/calendar/use-virtual-agenda-list";

type CalendarAgendaViewProps = {
  eventsByDay: CalendarEventsByDay;
  startDate: string;
  endDate: string;
  displayTimezone: string;
  selectedEventId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
};

export function CalendarAgendaView({
  eventsByDay,
  startDate,
  endDate,
  displayTimezone,
  selectedEventId,
  onEventClick,
  onLoadMore,
  hasMore,
}: CalendarAgendaViewProps) {
  const { t } = useTranslation("common");
  const groups = useAgendaGroups(startDate, endDate, eventsByDay);
  const {
    attachScrollRef,
    onScroll,
    visibleGroups,
    paddingTop,
    paddingBottom,
    totalHeight,
    visibleRange,
  } = useVirtualAgendaList(groups);

  const todayDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: displayTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [displayTimezone],
  );

  return (
    <div
      ref={attachScrollRef}
      onScroll={onScroll}
      className="max-h-[640px] overflow-y-auto"
      role="feed"
      aria-busy={false}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ paddingTop, paddingBottom }} className="space-y-4">
          {visibleGroups.map((group) => (
            <CalendarAgendaDayGroup
              key={group.date}
              group={group}
              todayDate={todayDate}
              selectedEventId={selectedEventId}
              onEventClick={onEventClick}
            />
          ))}
        </div>
        <span className="sr-only">
          Showing days {visibleRange.startIndex + 1} to {visibleRange.endIndex}
        </span>
      </div>
      {hasMore && onLoadMore && (
        <div className="py-4 text-center">
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={onLoadMore}
          >
            {t("calendar.agenda.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
