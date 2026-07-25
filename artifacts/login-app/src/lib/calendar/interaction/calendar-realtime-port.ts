/** Future-ready port for realtime calendar refresh — not wired in Sprint 5.4. */
export type CalendarRealtimeEvent =
  | { type: "booking-created"; bookingId: string }
  | { type: "booking-updated"; bookingId: string }
  | { type: "booking-cancelled"; bookingId: string };

export type CalendarRealtimeSubscription = {
  unsubscribe: () => void;
};

export interface CalendarRealtimePort {
  subscribe(companyId: string, onEvent: (event: CalendarRealtimeEvent) => void): CalendarRealtimeSubscription;
}

export class NoOpCalendarRealtimePort implements CalendarRealtimePort {
  subscribe(): CalendarRealtimeSubscription {
    return { unsubscribe: () => undefined };
  }
}
