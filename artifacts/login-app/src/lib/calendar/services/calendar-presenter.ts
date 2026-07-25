import type { CalendarPermissions } from "@/lib/calendar/policies/calendar-interaction-policy";
import {
  canCancelEvent,
  canCompleteEvent,
  canDragEvent,
  canEditEvent,
  canResizeEvent,
} from "@/lib/calendar/policies/calendar-interaction-policy";
import type { CalendarEvent, CalendarEventRecord } from "@/lib/calendar/types/calendar-event";
import { CalendarColorService } from "@/lib/calendar/services/calendar-color-service";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";

export type CalendarEventPermissions = CalendarPermissions;

export class CalendarPresenter {
  constructor(private readonly colorService: CalendarColorService = new CalendarColorService()) {}

  mapRecordToEvent(
    record: CalendarEventRecord,
    displayTimezone: string,
    permissions: CalendarEventPermissions,
  ): CalendarEvent {
    const start = TimezoneResolver.parseInstant(record.start_at);
    const end = TimezoneResolver.parseInstant(record.end_at);
    const durationMinutes = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 60_000),
    );

    const displayStart = TimezoneResolver.localTimeForInstant(start, displayTimezone);
    const displayEnd = TimezoneResolver.localTimeForInstant(end, displayTimezone);
    const displayDate = TimezoneResolver.localDateForInstant(start, displayTimezone);

    const serviceName = record.scheduling_services?.name ?? "—";
    const customerName = record.customers?.name ?? "—";

    const event: CalendarEvent = {
      id: record.id,
      companyId: record.company_id,
      version: record.version,
      startAt: record.start_at,
      endAt: record.end_at,
      timezone: record.timezone,
      displayStart,
      displayEnd,
      displayDate,
      durationMinutes,
      title: serviceName,
      subtitle: customerName,
      status: record.status,
      source: record.source,
      color: this.colorService.getEventColor(record.status),
      customer: record.customers
        ? { id: record.customers.id, name: record.customers.name }
        : null,
      service: record.scheduling_services
        ? {
            id: record.scheduling_services.id,
            name: record.scheduling_services.name,
            durationMinutes: record.scheduling_services.duration_minutes,
          }
        : null,
      resource: record.scheduling_resources
        ? {
            id: record.scheduling_resources.id,
            name: record.scheduling_resources.name,
            type: record.scheduling_resources.resource_type,
          }
        : null,
      branch: record.branches
        ? { id: record.branches.id, name: record.branches.name }
        : null,
      icons: this.colorService.resolveIcons(record),
      isDraggable: canDragEvent(record.status, permissions),
      isResizable: canResizeEvent(record.status, permissions),
      permissions: {
        canEdit: canEditEvent(record.status, permissions),
        canCancel: canCancelEvent(record.status, permissions),
        canComplete: canCompleteEvent(record.status, permissions),
      },
      extensions: {},
    };

    return event;
  }
}
