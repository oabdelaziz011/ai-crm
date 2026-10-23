import assert from "node:assert/strict";
import { bookingMinutesOnDate } from "../src/lib/scheduling/booking-domain/booking-repository.ts";
import {
  absoluteMinutesFromLocalMidnight,
  localDateTimeToInstantIso,
  localDayLengthMinutes,
} from "../src/lib/scheduling/booking-domain/booking-time-utils.ts";
import { SlotGenerationResolver } from "../src/lib/scheduling/slot-generation-engine/slot-generation-resolver.ts";

const timezone = "America/New_York";

assert.equal(localDayLengthMinutes("2026-06-15", "Asia/Riyadh"), 1440);
assert.equal(absoluteMinutesFromLocalMidnight("2026-06-15", "09:00", "Asia/Riyadh"), 9 * 60);
assert.equal(localDayLengthMinutes("2026-03-08", timezone), 1380);
assert.equal(localDayLengthMinutes("2026-11-01", timezone), 1500);
assert.equal(absoluteMinutesFromLocalMidnight("2026-03-08", "03:00", timezone), 120);
assert.equal(absoluteMinutesFromLocalMidnight("2026-11-01", "02:00", timezone), 180);

const longBooking = bookingMinutesOnDate(
  "2026-06-01T04:00:00.000Z",
  "2026-06-15T14:00:00.000Z",
  timezone,
  "2026-06-15",
  0,
);
assert.ok(longBooking);
assert.ok(longBooking.startMinutes < -1440);
assert.equal(longBooking.startMinutes + longBooking.durationMinutes, 10 * 60);
const longSlots = resolveSlots("2026-06-15", longBooking, 0, 0, false, [{ start: "09:00", end: "12:00" }]);
assert.equal(longSlots.includes("09:30"), false);
assert.equal(longSlots.includes("10:00"), true);

const spring = bookingMinutesOnDate(
  localDateTimeToInstantIso("2026-03-08", "01:00", timezone),
  localDateTimeToInstantIso("2026-03-08", "01:30", timezone),
  timezone,
  "2026-03-08",
  60,
);
assert.ok(spring);
const springSlots = resolveSlots("2026-03-08", spring, 0, 60, false, [{ start: "00:00", end: "06:00" }]);
assert.equal(springSlots.includes("03:00"), false);
assert.equal(springSlots.includes("03:30"), true);
const equalGap = resolveSlots("2026-03-08", spring, 30, 30, false, [{ start: "00:00", end: "06:00" }]);
assert.equal(equalGap.includes("03:00"), true);
assert.equal(equalGap.includes("01:30"), false);
const overbooked = resolveSlots("2026-03-08", spring, 0, 60, true, [{ start: "00:00", end: "06:00" }]);
assert.equal(overbooked.includes("03:00"), true);

const fall = bookingMinutesOnDate(
  localDateTimeToInstantIso("2026-11-01", "00:30", timezone),
  localDateTimeToInstantIso("2026-11-01", "01:30", timezone),
  timezone,
  "2026-11-01",
  90,
);
assert.ok(fall);
const fallSlots = resolveSlots("2026-11-01", fall, 0, 90, false, [{ start: "00:00", end: "04:00" }]);
assert.equal(fallSlots.includes("01:30"), false);
assert.equal(fallSlots.includes("02:00"), true);

const beforeGap = bookingMinutesOnDate(
  localDateTimeToInstantIso("2026-03-08", "03:30", timezone),
  localDateTimeToInstantIso("2026-03-08", "04:00", timezone),
  timezone,
  "2026-03-08",
  60,
);
assert.ok(beforeGap);
const beforeSlots = resolveSlots("2026-03-08", beforeGap, 60, 0, false, [{ start: "00:00", end: "06:00" }]);
assert.equal(beforeSlots.includes("01:00"), true);
assert.equal(beforeSlots.includes("01:30"), false);

console.log("login span and dst buffers: ok");

function resolveSlots(
  date: string,
  placed: { startMinutes: number; durationMinutes: number },
  before: number,
  after: number,
  overbook: boolean,
  periods: { start: string; end: string }[],
): string[] {
  return SlotGenerationResolver.resolve({
    resourceId: "resource",
    serviceId: "service",
    date,
    timezone,
    durationMinutes: 30,
    periods,
    availabilityReasons: [],
    availabilityAvailable: true,
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: before,
      bufferAfterMinutes: after,
      allowOverbooking: overbook,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 365,
    },
    existingBookings: [{ id: "span", ...placed, status: "Confirmed" }],
    options: { referenceNow: new Date("2026-01-01T00:00:00.000Z"), date, timezone },
  }).slots;
}
