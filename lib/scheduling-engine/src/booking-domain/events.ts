import type { SchedulingBooking } from "./types.js";

export type BookingCreatedEvent = {
  type: "BookingCreated";
  occurredAt: string;
  payload: {
    booking: SchedulingBooking;
  };
};

export type BookingCancelledEvent = {
  type: "BookingCancelled";
  occurredAt: string;
  payload: {
    booking: SchedulingBooking;
    reason?: string | null;
  };
};

export type BookingCompletedEvent = {
  type: "BookingCompleted";
  occurredAt: string;
  payload: {
    booking: SchedulingBooking;
  };
};

export type BookingRescheduledEvent = {
  type: "BookingRescheduled";
  occurredAt: string;
  payload: {
    previousBooking: SchedulingBooking;
    booking: SchedulingBooking;
  };
};

export type BookingCheckedInEvent = {
  type: "BookingCheckedIn";
  occurredAt: string;
  payload: {
    booking: SchedulingBooking;
  };
};

export type BookingNoShowEvent = {
  type: "BookingNoShow";
  occurredAt: string;
  payload: {
    booking: SchedulingBooking;
    gracePeriodMinutes: number;
  };
};

export type BookingDomainEvent =
  | BookingCreatedEvent
  | BookingCancelledEvent
  | BookingCompletedEvent
  | BookingRescheduledEvent
  | BookingCheckedInEvent
  | BookingNoShowEvent;

export interface BookingEventPublisher {
  publish(event: BookingDomainEvent): void | Promise<void>;
}

export class NoOpBookingEventPublisher implements BookingEventPublisher {
  publish(_event: BookingDomainEvent): void {
    // intentionally empty
  }
}

export class BookingEventCollector implements BookingEventPublisher {
  readonly events: BookingDomainEvent[] = [];

  publish(event: BookingDomainEvent): void {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function createBookingCreatedEvent(booking: SchedulingBooking): BookingCreatedEvent {
  return {
    type: "BookingCreated",
    occurredAt: new Date().toISOString(),
    payload: { booking },
  };
}

export function createBookingCancelledEvent(
  booking: SchedulingBooking,
  reason?: string | null,
): BookingCancelledEvent {
  return {
    type: "BookingCancelled",
    occurredAt: new Date().toISOString(),
    payload: { booking, reason },
  };
}

export function createBookingCompletedEvent(booking: SchedulingBooking): BookingCompletedEvent {
  return {
    type: "BookingCompleted",
    occurredAt: new Date().toISOString(),
    payload: { booking },
  };
}

export function createBookingRescheduledEvent(
  previousBooking: SchedulingBooking,
  booking: SchedulingBooking,
): BookingRescheduledEvent {
  return {
    type: "BookingRescheduled",
    occurredAt: new Date().toISOString(),
    payload: { previousBooking, booking },
  };
}

export function createBookingCheckedInEvent(booking: SchedulingBooking): BookingCheckedInEvent {
  return {
    type: "BookingCheckedIn",
    occurredAt: new Date().toISOString(),
    payload: { booking },
  };
}

export function createBookingNoShowEvent(
  booking: SchedulingBooking,
  gracePeriodMinutes: number,
): BookingNoShowEvent {
  return {
    type: "BookingNoShow",
    occurredAt: new Date().toISOString(),
    payload: { booking, gracePeriodMinutes },
  };
}
