import assert from "node:assert/strict";
import { BookingLifecycleService } from "../src/lib/scheduling/booking-domain/booking-lifecycle-service.ts";
import {
  evaluateCancellationPolicy,
  evaluateReschedulePolicy,
} from "../src/lib/scheduling/booking-domain/booking-policy.ts";
import { formatBookingValidationErrors } from "../src/lib/scheduling/booking-domain/booking-domain-errors.ts";
import {
  addMinutesToInstantIso,
  instantOverlaps,
  localDateTimeToInstantIso,
  minutesUntilAppointment,
} from "../src/lib/scheduling/booking-domain/booking-time-utils.ts";
import {
  BookingEventCollector,
  createBookingCancelledEvent,
  createBookingCompletedEvent,
  createBookingCreatedEvent,
  createBookingRescheduledEvent,
} from "../src/lib/scheduling/booking-domain/events.ts";
import { BookingConflictResolver } from "../src/lib/scheduling/slot-generation-engine/booking-conflict-resolver.ts";
import { SlotGenerationResolver } from "../src/lib/scheduling/slot-generation-engine/slot-generation-resolver.ts";
import type { SchedulingBooking } from "../src/lib/scheduling/booking-domain/types.ts";

function booking(overrides: Partial<SchedulingBooking> = {}): SchedulingBooking {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    company_id: "00000000-0000-4000-8000-000000000099",
    branch_id: null,
    customer_id: "00000000-0000-4000-8000-000000000050",
    resource_id: "00000000-0000-4000-8000-000000000001",
    service_id: "00000000-0000-4000-8000-000000000002",
    start_at: "2026-07-20T09:00:00.000Z",
    end_at: "2026-07-20T09:30:00.000Z",
    timezone: "UTC",
    status: "confirmed",
    source: "crm",
    notes: null,
    rescheduled_from_id: null,
    version: 1,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...overrides,
  };
}

{
  assert.equal(BookingLifecycleService.canTransition("pending", "confirmed"), true);
  assert.equal(BookingLifecycleService.canTransition("confirmed", "completed"), true);
  assert.equal(BookingLifecycleService.canTransition("confirmed", "cancelled"), true);
  assert.equal(BookingLifecycleService.canTransition("completed", "cancelled"), false);
  assert.equal(BookingLifecycleService.isActive("confirmed"), true);
  assert.equal(BookingLifecycleService.isActive("cancelled"), false);
}

{
  const start = localDateTimeToInstantIso("2026-07-20", "09:00", "UTC");
  assert.equal(start, "2026-07-20T09:00:00.000Z");
  const end = addMinutesToInstantIso(start, 30);
  assert.equal(end, "2026-07-20T09:30:00.000Z");
}

{
  const riyadhStart = localDateTimeToInstantIso("2026-07-20", "09:00", "Asia/Riyadh");
  assert.ok(riyadhStart.includes("T"), "Riyadh local time converts to ISO instant");
}

{
  assert.equal(
    instantOverlaps(
      "2026-07-20T09:00:00.000Z",
      "2026-07-20T09:30:00.000Z",
      "2026-07-20T09:15:00.000Z",
      "2026-07-20T09:45:00.000Z",
    ),
    true,
  );
  assert.equal(
    instantOverlaps(
      "2026-07-20T09:00:00.000Z",
      "2026-07-20T09:30:00.000Z",
      "2026-07-20T09:30:00.000Z",
      "2026-07-20T10:00:00.000Z",
    ),
    false,
  );
}

{
  const slots = SlotGenerationResolver.generateSlots(
    [
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "17:00" },
    ],
    30,
    {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowOverbooking: false,
    },
  );

  const afterBooking = SlotGenerationResolver.removeBookedSlots(
    slots,
    30,
    [{ id: "b1", startMinutes: 9 * 60, durationMinutes: 30, status: "Confirmed" }],
    { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
  );

  assert.ok(!afterBooking.includes("09:00"), "double booking slot removed");
  assert.ok(afterBooking.includes("09:30"));
}

{
  const multi = SlotGenerationResolver.removeBookedSlots(
    ["09:00", "09:30", "10:00", "14:00"],
    30,
    [
      { id: "b1", startMinutes: 9 * 60, durationMinutes: 30, status: "Confirmed" },
      { id: "b2", startMinutes: 10 * 60, durationMinutes: 30, status: "Confirmed" },
    ],
    { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
  );
  assert.deepEqual(multi, ["09:30", "14:00"]);
}

{
  const cancelled = SlotGenerationResolver.removeBookedSlots(
    ["09:00", "09:30"],
    30,
    [{ id: "b1", startMinutes: 9 * 60, durationMinutes: 30, status: "Cancelled" }],
    { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
  );
  assert.deepEqual(cancelled, ["09:00", "09:30"], "cancelled bookings do not block slots");
}

{
  const blocked = BookingConflictResolver.toBlockedIntervals(
    [{ id: "b1", startMinutes: 10 * 60, durationMinutes: 30, status: "Confirmed" }],
    15,
    15,
  );
  assert.deepEqual(blocked, [{ start: 585, end: 645 }]);
}

{
  const collector = new BookingEventCollector();
  const created = booking();
  collector.publish(createBookingCreatedEvent(created));
  collector.publish(createBookingCancelledEvent(created));
  collector.publish(createBookingCompletedEvent({ ...created, status: "completed" }));
  collector.publish(
    createBookingRescheduledEvent(created, {
      ...created,
      id: "00000000-0000-4000-8000-000000000101",
    }),
  );
  assert.equal(collector.events.length, 4);
  assert.equal(collector.events[0]?.type, "BookingCreated");
  assert.equal(collector.events[3]?.type, "BookingRescheduled");
}

{
  assert.throws(
    () => BookingLifecycleService.assertTransition("completed", "cancelled"),
    /INVALID_STATUS_TRANSITION/,
  );
}

{
  const wrongResourceSlots = SlotGenerationResolver.resolve({
    resourceId: "00000000-0000-4000-8000-000000000001",
    serviceId: "00000000-0000-4000-8000-000000000002",
    date: "2026-07-20",
    timezone: "UTC",
    durationMinutes: 30,
    periods: [],
    availabilityReasons: ["resource_inactive"],
    availabilityAvailable: false,
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowOverbooking: false,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 90,
    },
    existingBookings: [],
    options: {},
  });
  assert.equal(wrongResourceSlots.slots.length, 0);
}

{
  const wrongService = SlotGenerationResolver.resolve({
    resourceId: "00000000-0000-4000-8000-000000000001",
    serviceId: "00000000-0000-4000-8000-000000000003",
    date: "2026-07-20",
    timezone: "UTC",
    durationMinutes: 30,
    periods: [],
    availabilityReasons: ["capability_missing"],
    availabilityAvailable: false,
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowOverbooking: false,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 90,
    },
    existingBookings: [],
    options: {},
  });
  assert.ok(wrongService.reasons.includes("capability_missing"));
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const referenceNow = new Date("2026-07-20T11:30:00.000Z");
  assert.equal(minutesUntilAppointment(appointmentStart, referenceNow), 150);
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 240, referenceNow),
    "cancellation_window_expired",
    "150 minutes remaining is inside 240-minute cancellation policy",
  );
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const referenceNow = new Date("2026-07-20T10:00:00.000Z");
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 240, referenceNow),
    null,
    "240 minutes remaining satisfies 240-minute cancellation policy",
  );
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const boundaryNow = new Date("2026-07-20T10:00:00.000Z");
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 240, boundaryNow),
    null,
    "exact boundary allows cancellation",
  );
  const justInsideWindow = new Date("2026-07-20T10:00:01.000Z");
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 240, justInsideWindow),
    "cancellation_window_expired",
    "one second past boundary rejects cancellation",
  );
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const referenceNow = new Date("2026-07-20T08:00:00.000Z");
  assert.equal(
    evaluateReschedulePolicy(appointmentStart, 720, referenceNow),
    "reschedule_window_expired",
    "360 minutes remaining is inside 720-minute reschedule policy",
  );
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const referenceNow = new Date("2026-07-20T02:00:00.000Z");
  assert.equal(
    evaluateReschedulePolicy(appointmentStart, 720, referenceNow),
    null,
    "720 minutes remaining satisfies 720-minute reschedule policy",
  );
}

{
  const cairoStart = localDateTimeToInstantIso("2026-07-20", "14:00", "Africa/Cairo");
  const cairoNow = localDateTimeToInstantIso("2026-07-20", "11:30", "Africa/Cairo");
  assert.equal(
    minutesUntilAppointment(cairoStart, new Date(cairoNow)),
    150,
    "timezone-aware remaining minutes use stored UTC instants",
  );
  assert.equal(
    evaluateCancellationPolicy(cairoStart, 240, new Date(cairoNow)),
    "cancellation_window_expired",
  );
}

{
  const appointmentStart = localDateTimeToInstantIso("2026-07-20", "14:00", "UTC");
  const referenceNow = new Date("2026-07-20T13:59:00.000Z");
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 0, referenceNow),
    null,
    "zero-minute policy allows cancellation until start",
  );
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 0, new Date("2026-07-20T14:00:00.000Z")),
    null,
    "zero-minute policy allows cancellation at exact start instant",
  );
  assert.equal(
    evaluateCancellationPolicy(appointmentStart, 0, new Date("2026-07-20T14:00:01.000Z")),
    "cancellation_window_expired",
    "zero-minute policy rejects after appointment start",
  );
}

{
  const message = formatBookingValidationErrors(["cancellation_window_expired"], (key) =>
    key.endsWith("cancellationWindowExpired") ? "Cancellation window has expired." : key,
  );
  assert.equal(message, "Cancellation window has expired.");
}

console.log("✔ scheduling booking domain unit tests (22 scenarios)");
