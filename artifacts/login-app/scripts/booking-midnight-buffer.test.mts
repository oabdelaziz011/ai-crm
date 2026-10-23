import assert from "node:assert/strict";
import { bookingMinutesOnDate } from "../src/lib/scheduling/booking-domain/booking-repository.ts";
import { BookingConflictResolver } from "../src/lib/scheduling/slot-generation-engine/booking-conflict-resolver.ts";

const placed = bookingMinutesOnDate(
  "2026-12-05T20:40:00.000Z",
  "2026-12-05T20:55:00.000Z",
  "Asia/Riyadh",
  "2026-12-06",
  30,
);
assert.deepEqual(placed, { startMinutes: -20, durationMinutes: 15 });
const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
  ["00:00", "00:25"],
  30,
  [{ id: "late", startMinutes: placed?.startMinutes ?? 0, durationMinutes: placed?.durationMinutes ?? 0, status: "Confirmed" }],
  { bufferBeforeMinutes: 0, bufferAfterMinutes: 30, allowOverbooking: false },
);
assert.deepEqual(remaining, ["00:25"]);
const sameDay = bookingMinutesOnDate(
  "2026-12-05T09:00:00.000Z",
  "2026-12-05T09:30:00.000Z",
  "UTC",
  "2026-12-05",
  0,
);
assert.deepEqual(sameDay, { startMinutes: 9 * 60, durationMinutes: 30 });
console.log("login midnight buffer: ok");
