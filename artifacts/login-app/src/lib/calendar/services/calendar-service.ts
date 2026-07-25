import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { CalendarPermissions } from "@/lib/calendar/policies/calendar-interaction-policy";
import type { CalendarRepository } from "@/lib/calendar/repository/calendar-repository";
import type {
  CalendarEvent,
  CalendarEventRecord,
  CalendarEventsByDay,
  CalendarEventsByResource,
} from "@/lib/calendar/types/calendar-event";
import type { CalendarFetchRange, CalendarVisibleRange } from "@/lib/calendar/types/calendar-range";
import type { CalendarFilters, CalendarViewState } from "@/lib/calendar/types/calendar-view-state";
import { CalendarPresenter } from "@/lib/calendar/services/calendar-presenter";
import { CalendarQueryPlanner } from "@/lib/calendar/services/calendar-query-planner";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";

export type CalendarServiceOptions = {
  permissions?: CalendarPermissions;
  rulesTimezone?: string | null;
};

export class CalendarService {
  private readonly presenter = new CalendarPresenter();
  private readonly queryPlanner = new CalendarQueryPlanner();

  constructor(private readonly repository: CalendarRepository) {}

  resolveDisplayTimezone(viewState: CalendarViewState, rulesTimezone?: string | null): string {
    if (viewState.displayTimezone) {
      return viewState.displayTimezone;
    }
    return rulesTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  getVisibleRange(viewState: CalendarViewState): CalendarVisibleRange {
    return this.queryPlanner.planVisibleRange(
      viewState.view,
      viewState.anchorDate,
      viewState.displayTimezone,
      viewState.weekStartDay,
    );
  }

  getFetchRange(viewState: CalendarViewState): CalendarFetchRange {
    return this.queryPlanner.planFetchRange(
      viewState.view,
      viewState.anchorDate,
      viewState.displayTimezone,
      viewState.weekStartDay,
    );
  }

  async getEventsForRange(
    companyId: string,
    fetchRange: CalendarFetchRange,
    filters: CalendarFilters,
    displayTimezone: string,
    options: CalendarServiceOptions = {},
  ): Promise<CalendarEvent[]> {
    const records = await this.repository.listEventsInRange({
      companyId,
      rangeStart: fetchRange.start,
      rangeEnd: fetchRange.end,
      branchId: filters.branchId,
      resourceIds: filters.resourceIds === "all" ? undefined : filters.resourceIds,
      serviceIds: filters.serviceIds.length ? filters.serviceIds : undefined,
      statuses: filters.statuses.length ? filters.statuses : undefined,
    });

    const permissions = options.permissions ?? {};
    return records.map((record) =>
      this.presenter.mapRecordToEvent(record, displayTimezone, permissions),
    );
  }

  filterEventsToVisible(
    events: CalendarEvent[],
    visibleRange: CalendarVisibleRange,
  ): CalendarEvent[] {
    const visibleStart = Date.parse(visibleRange.start);
    const visibleEnd = Date.parse(visibleRange.end);
    return events.filter((event) => {
      const start = Date.parse(event.startAt);
      const end = Date.parse(event.endAt);
      return start < visibleEnd && end > visibleStart;
    });
  }

  groupEventsByDay(events: CalendarEvent[], timezone: string): CalendarEventsByDay {
    const grouped: CalendarEventsByDay = new Map();
    for (const event of events) {
      const dayKey =
        event.displayDate ||
        TimezoneResolver.localDateForInstant(
          TimezoneResolver.parseInstant(event.startAt),
          timezone,
        );
      const bucket = grouped.get(dayKey) ?? [];
      bucket.push(event);
      grouped.set(dayKey, bucket);
    }
    for (const [, bucket] of grouped) {
      bucket.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    }
    return grouped;
  }

  groupEventsByResource(events: CalendarEvent[]): CalendarEventsByResource {
    const grouped: CalendarEventsByResource = new Map();
    for (const event of events) {
      const resourceId = event.resource?.id ?? "unassigned";
      const bucket = grouped.get(resourceId) ?? [];
      bucket.push(event);
      grouped.set(resourceId, bucket);
    }
    for (const [, bucket] of grouped) {
      bucket.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    }
    return grouped;
  }

  mapRecordsToEvents(
    records: CalendarEventRecord[],
    displayTimezone: string,
    permissions: CalendarPermissions = {},
  ): CalendarEvent[] {
    return records.map((record) =>
      this.presenter.mapRecordToEvent(record, displayTimezone, permissions),
    );
  }
}

export function hashCalendarFilters(filters: CalendarFilters): string {
  const resourceKey =
    filters.resourceIds === "all" ? "all" : [...filters.resourceIds].sort().join(",");
  const serviceKey = [...filters.serviceIds].sort().join(",");
  const statusKey = [...filters.statuses].sort().join(",");
  return [resourceKey, filters.branchId ?? "", serviceKey, statusKey].join("|");
}

export function isActiveCalendarStatus(status: SchedulingBookingStatus): boolean {
  return status !== "cancelled" && status !== "rescheduled";
}
