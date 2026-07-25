import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import {
  mapSchedulingStatus,
  type AppBooking,
} from "@/lib/booking/booking-view-adapter";

/** Maps a canonical CalendarEvent to the existing BookingModal AppBooking shape. */
export function calendarEventToAppBooking(
  event: CalendarEvent,
  fallbackUserId = "",
): AppBooking {
  return {
    id: event.id,
    user_id: fallbackUserId,
    customer_id: event.customer?.id ?? "",
    service: event.service?.name ?? event.title,
    doctor_id: event.resource?.id ?? null,
    location_id: event.branch?.id ?? null,
    booking_date: event.startAt,
    duration_minutes: event.durationMinutes,
    notes: null,
    status: mapSchedulingStatus(event.status),
    created_at: event.startAt,
    updated_at: event.endAt,
    customers: event.customer,
    isSchedulingBooking: true,
    service_id: event.service?.id ?? null,
    resource_id: event.resource?.id ?? null,
    scheduling_status: event.status,
    source: event.source,
  };
}
