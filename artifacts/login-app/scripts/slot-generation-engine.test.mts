import assert from "node:assert/strict";
import { AvailabilityResolver } from "../src/lib/scheduling/availability-engine/availability-resolver.ts";
import { SlotGenerationResolver } from "../src/lib/scheduling/slot-generation-engine/slot-generation-resolver.ts";
import { SlotGenerator } from "../src/lib/scheduling/slot-generation-engine/slot-generator.ts";
import { BookingConflictResolver } from "../src/lib/scheduling/slot-generation-engine/booking-conflict-resolver.ts";
import type { AvailabilityContextSnapshot } from "../src/lib/scheduling/availability-engine/availability-context.ts";
import type {
  ExistingBooking,
  SlotGenerationSnapshot,
} from "../src/lib/scheduling/slot-generation-engine/types.ts";
import { DEFAULT_BOOKING_RULES } from "../src/lib/scheduling/types.ts";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
const RESOURCE_ID = "00000000-0000-4000-8000-000000000001";
const SERVICE_ID = "00000000-0000-4000-8000-000000000002";
const WEEKLY_MONDAY_ID = "00000000-0000-4000-8000-000000000010";

function buildAvailabilitySnapshot(
  partial: Partial<AvailabilityContextSnapshot> = {},
): AvailabilityContextSnapshot {
  return {
    resourceId: RESOURCE_ID,
    resource: {
      id: RESOURCE_ID,
      company_id: COMPANY_ID,
      branch_id: null,
      name: "Dr. Smith",
      resource_type: "doctor",
      status: "active",
      timezone: "UTC",
      description: null,
      metadata: {},
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
      deleted_at: null,
    },
    service: {
      id: SERVICE_ID,
      company_id: COMPANY_ID,
      name: "Consultation",
      description: null,
      duration_minutes: 30,
      status: "active",
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
      deleted_at: null,
    },
    branch: null,
    weeklyHours: [
      {
        id: WEEKLY_MONDAY_ID,
        company_id: COMPANY_ID,
        resource_id: RESOURCE_ID,
        day_of_week: 1,
        is_closed: false,
        opens_at: "09:00",
        closes_at: "17:00",
        created_at: "",
        updated_at: "",
      },
    ],
    breaks: [
      {
        id: "break1",
        company_id: COMPANY_ID,
        weekly_hours_id: WEEKLY_MONDAY_ID,
        resource_id: RESOURCE_ID,
        starts_at: "13:00",
        ends_at: "14:00",
        label: "Lunch",
        created_at: "",
        updated_at: "",
      },
    ],
    exceptions: [],
    holidays: [],
    bookingRules: {
      id: "rules",
      company_id: COMPANY_ID,
      ...DEFAULT_BOOKING_RULES,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
    },
    serviceCapabilityIds: [SERVICE_ID],
    date: "2026-07-20",
    serviceId: SERVICE_ID,
    options: {},
    ...partial,
  };
}

function buildSlotSnapshot(
  partial: Partial<SlotGenerationSnapshot> = {},
): SlotGenerationSnapshot {
  const availability = AvailabilityResolver.resolve(buildAvailabilitySnapshot());
  return {
    resourceId: RESOURCE_ID,
    serviceId: SERVICE_ID,
    date: "2026-07-20",
    timezone: "UTC",
    durationMinutes: 30,
    periods: availability.periods,
    availabilityReasons: availability.reasons,
    availabilityAvailable: availability.available,
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowOverbooking: false,
      minBookingNoticeMinutes: 60,
      maxBookingWindowDays: 90,
    },
    existingBookings: [],
    options: {},
    ...partial,
  };
}

function resolveSlots(partial: Partial<SlotGenerationSnapshot> = {}) {
  return SlotGenerationResolver.resolve(buildSlotSnapshot(partial));
}

function slotsForDuration(duration: number, interval = 30) {
  return SlotGenerator.generateSlots(
    [
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "17:00" },
    ],
    duration,
    { slotIntervalMinutes: interval },
  );
}

{
  const result = resolveSlots();
  assert.equal(result.available, true);
  assert.deepEqual(result.periods, [
    { start: "09:00", end: "13:00" },
    { start: "14:00", end: "17:00" },
  ]);
  assert.deepEqual(result.slots, [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
  ]);
}

{
  const slots30 = slotsForDuration(30);
  assert.ok(slots30.includes("09:00"));
  assert.ok(slots30.includes("16:30"));
}

{
  const slots45 = slotsForDuration(45, 15);
  assert.deepEqual(slots45, [
    "09:00",
    "09:15",
    "09:30",
    "09:45",
    "10:00",
    "10:15",
    "10:30",
    "10:45",
    "11:00",
    "11:15",
    "11:30",
    "11:45",
    "12:00",
    "12:15",
    "14:00",
    "14:15",
    "14:30",
    "14:45",
    "15:00",
    "15:15",
    "15:30",
    "15:45",
    "16:00",
    "16:15",
  ]);
}

{
  const slots60 = slotsForDuration(60, 60);
  assert.deepEqual(slots60, ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"]);
}

{
  const slots90 = slotsForDuration(90, 30);
  assert.deepEqual(slots90, ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30"]);
}

{
  const withBuffer = resolveSlots({
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      allowOverbooking: false,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 90,
    },
    existingBookings: [
      { id: "b1", startMinutes: 10 * 60, durationMinutes: 30, status: "Confirmed" },
    ],
  });
  assert.ok(!withBuffer.slots.includes("09:30"), "09:30 blocked by buffer before 10:00 booking");
  assert.ok(!withBuffer.slots.includes("10:00"), "10:00 booking occupied");
  assert.ok(!withBuffer.slots.includes("10:30"), "10:30 overlaps buffer after booking");
  assert.ok(withBuffer.slots.includes("11:00"));
}

{
  const multiBooking = resolveSlots({
    existingBookings: [
      { id: "b1", startMinutes: 9 * 60, durationMinutes: 30, status: "Confirmed" },
      { id: "b2", startMinutes: 14 * 60 + 30, durationMinutes: 30, status: "Confirmed" },
    ],
  });
  assert.ok(!multiBooking.slots.includes("09:00"));
  assert.ok(!multiBooking.slots.includes("14:30"));
  assert.ok(multiBooking.slots.includes("10:00"));
  assert.ok(multiBooking.slots.includes("15:00"));
}

{
  const holiday = resolveSlots({
    periods: [],
    availabilityAvailable: false,
    availabilityReasons: ["holiday"],
  });
  assert.equal(holiday.available, false);
  assert.equal(holiday.slots.length, 0);
}

{
  const exception = resolveSlots({
    periods: [{ start: "09:00", end: "13:00" }],
    availabilityAvailable: true,
    availabilityReasons: [],
  });
  assert.ok(!exception.slots.some((s) => s >= "14:00"));
}

{
  const inactive = resolveSlots({
    periods: [],
    availabilityAvailable: false,
    availabilityReasons: ["resource_inactive"],
  });
  assert.equal(inactive.slots.length, 0);
}

{
  const minNotice = resolveSlots({
    options: {
      respectBookingRules: true,
      referenceNow: new Date("2026-07-20T10:00:00.000Z"),
      timezone: "UTC",
      date: "2026-07-20",
      minBookingNoticeMinutes: 60,
    },
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      allowOverbooking: false,
      minBookingNoticeMinutes: 60,
      maxBookingWindowDays: 90,
    },
  });
  assert.ok(!minNotice.slots.includes("09:00"));
  assert.ok(!minNotice.slots.includes("10:00"));
  assert.ok(minNotice.slots.includes("11:00"));
}

{
  const outsideWindow = resolveSlots({
    periods: [],
    availabilityAvailable: false,
    availabilityReasons: ["outside_booking_window"],
  });
  assert.equal(outsideWindow.slots.length, 0);
}

{
  const tzSnapshot = buildAvailabilitySnapshot({
    resource: {
      ...buildAvailabilitySnapshot().resource!,
      timezone: "Asia/Riyadh",
    },
  });
  const availability = AvailabilityResolver.resolve(tzSnapshot);
  const tzSlots = SlotGenerationResolver.resolve(
    buildSlotSnapshot({
      timezone: availability.timezone,
      periods: availability.periods,
      availabilityAvailable: availability.available,
      availabilityReasons: availability.reasons,
    }),
  );
  assert.equal(tzSlots.timezone, "Asia/Riyadh");
  assert.ok(tzSlots.slots.length > 0);
}

{
  const removed = SlotGenerationResolver.removeBookedSlots(
    ["09:00", "09:30", "10:00"],
    30,
    [{ id: "b1", startMinutes: 9 * 60 + 30, durationMinutes: 30, status: "Confirmed" }],
    { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
  );
  assert.deepEqual(removed, ["09:00", "10:00"]);
}

{
  const overbook = SlotGenerationResolver.removeBookedSlots(
    ["09:00", "09:30"],
    30,
    [{ id: "b1", startMinutes: 9 * 60, durationMinutes: 30, status: "Confirmed" }],
    { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: true },
  );
  assert.deepEqual(overbook, ["09:00", "09:30"]);
}

{
  const blocked = BookingConflictResolver.toBlockedIntervals(
    [{ id: "b1", startMinutes: 600, durationMinutes: 30, status: "Confirmed" }],
    10,
    20,
  );
  assert.deepEqual(blocked, [{ start: 590, end: 650 }]);
}

{
  const a = resolveSlots();
  const b = resolveSlots();
  assert.deepEqual(a.slots, b.slots);
}

console.log("✔ slot generation engine unit tests (18 scenarios)");
