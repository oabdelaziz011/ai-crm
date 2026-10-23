import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingMinutesOnDate } from "./booking-repository.js";
import {
  absoluteMinutesFromLocalMidnight,
  addMinutesToInstantIso,
  localDateTimeToInstantIso,
  localDayLengthMinutes,
} from "./booking-time-utils.js";
import { BookingConflictResolver } from "../slot-generation-engine/booking-conflict-resolver.js";
import { SlotGenerationResolver } from "../slot-generation-engine/slot-generation-resolver.js";
import type { ExistingBooking } from "../slot-generation-engine/types.js";

describe("booking minutes across midnight", () => {
  it("places an evening booking before midnight on the next local day", () => {
    const placed = bookingMinutesOnDate(
      "2026-12-05T23:40:00.000Z",
      "2026-12-05T23:55:00.000Z",
      "UTC",
      "2026-12-06",
      30,
    );
    assert.deepEqual(placed, { startMinutes: -20, durationMinutes: 15 });
  });

  it("keeps the same booking on its own day when the buffer does not cross", () => {
    const placed = bookingMinutesOnDate(
      "2026-12-05T23:40:00.000Z",
      "2026-12-05T23:55:00.000Z",
      "UTC",
      "2026-12-05",
      0,
    );
    assert.deepEqual(placed, { startMinutes: 23 * 60 + 40, durationMinutes: 15 });
    assert.equal(
      bookingMinutesOnDate(
        "2026-12-05T22:00:00.000Z",
        "2026-12-05T22:30:00.000Z",
        "UTC",
        "2026-12-06",
        0,
      ),
      null,
    );
  });

  it("uses the resource timezone rather than UTC midnight", () => {
    const placed = bookingMinutesOnDate(
      "2026-12-05T20:40:00.000Z",
      "2026-12-05T20:55:00.000Z",
      "Asia/Riyadh",
      "2026-12-06",
      30,
    );
    assert.deepEqual(placed, { startMinutes: -20, durationMinutes: 15 });
  });

  it("removes the next morning slot and keeps the exact boundary", () => {
    const placed = bookingMinutesOnDate(
      "2026-12-05T23:40:00.000Z",
      "2026-12-05T23:55:00.000Z",
      "UTC",
      "2026-12-06",
      30,
    );
    assert.ok(placed);
    const resolved = SlotGenerationResolver.resolve({
      resourceId: "resource",
      serviceId: "service",
      date: "2026-12-06",
      timezone: "UTC",
      durationMinutes: 30,
      periods: [{ start: "00:00", end: "02:00" }],
      availabilityReasons: [],
      availabilityAvailable: true,
      bookingRules: {
        durationMinutes: 30,
        slotIntervalMinutes: 5,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 30,
        allowOverbooking: false,
        minBookingNoticeMinutes: 0,
        maxBookingWindowDays: 365,
      },
      existingBookings: [{ id: "late", ...placed, status: "Confirmed" }],
      options: { referenceNow: new Date("2026-10-15T08:00:00.000Z"), date: "2026-12-06", timezone: "UTC" },
    });
    assert.equal(resolved.slots.includes("00:00"), false);
    assert.equal(resolved.slots.includes("00:20"), false);
    assert.equal(resolved.slots.includes("00:25"), true);
    const direct = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["00:00", "00:25"],
      30,
      [{ id: "late", ...placed, status: "Confirmed" }],
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 30, allowOverbooking: false },
    );
    assert.deepEqual(direct, ["00:25"]);
  });

  it("keeps wall-clock minutes when the offset does not change", () => {
    assert.equal(localDayLengthMinutes("2026-06-15", "UTC"), 1440);
    assert.equal(localDayLengthMinutes("2026-06-15", "Asia/Riyadh"), 1440);
    assert.equal(absoluteMinutesFromLocalMidnight("2026-06-15", "09:00", "Asia/Riyadh"), 9 * 60);
    const placed = bookingMinutesOnDate(
      "2026-06-15T06:00:00.000Z",
      "2026-06-15T06:30:00.000Z",
      "Asia/Riyadh",
      "2026-06-15",
      0,
    );
    assert.deepEqual(placed, { startMinutes: 9 * 60, durationMinutes: 30 });
  });

  it("keeps a long booking that started before the conflict window and ends inside the day", () => {
    const placed = bookingMinutesOnDate(
      "2026-01-01T15:00:00.000Z",
      "2026-06-15T14:00:00.000Z",
      "America/New_York",
      "2026-06-15",
      0,
    );
    assert.ok(placed);
    assert.ok(placed.startMinutes < -1440);
    assert.equal(placed.startMinutes + placed.durationMinutes, 10 * 60);
    assert.equal(
      bookingMinutesOnDate(
        "2026-06-01T15:00:00.000Z",
        "2026-06-14T20:00:00.000Z",
        "America/New_York",
        "2026-06-15",
        0,
      ),
      null,
    );
    const slots = resolveSlots("2026-06-15", "America/New_York", placed, 0, 0, false, [
      { start: "09:00", end: "12:00" },
    ]);
    assert.equal(slots.includes("09:30"), false);
    assert.equal(slots.includes("10:00"), true);
  });

  it("matches absolute buffers on the spring-forward and fall-back days", () => {
    assert.equal(localDayLengthMinutes("2026-03-08", "America/New_York"), 1380);
    assert.equal(localDayLengthMinutes("2026-11-01", "America/New_York"), 1500);
    assert.equal(absoluteMinutesFromLocalMidnight("2026-03-08", "03:00", "America/New_York"), 120);
    assert.equal(absoluteMinutesFromLocalMidnight("2026-11-01", "02:00", "America/New_York"), 180);

    const springBooking = localRange("2026-03-08", "01:00", "01:30");
    const springPlaced = bookingMinutesOnDate(springBooking.start, springBooking.end, "America/New_York", "2026-03-08", 60);
    assert.ok(springPlaced);
    const springSlots = resolveSlots(
      "2026-03-08",
      "America/New_York",
      springPlaced,
      0,
      60,
      false,
      [{ start: "00:00", end: "06:00" }],
    );
    assert.equal(springSlots.includes("03:00"), false);
    assert.equal(springSlots.includes("03:30"), true);
    assertMatchesSql("2026-03-08", springSlots, springBooking, 0, 60, [{ start: "00:00", end: "06:00" }]);

    const equalGap = resolveSlots(
      "2026-03-08",
      "America/New_York",
      springPlaced,
      30,
      30,
      false,
      [{ start: "00:00", end: "06:00" }],
    );
    assert.equal(equalGap.includes("01:30"), false);
    assert.equal(equalGap.includes("03:00"), true);

    const overbooked = resolveSlots(
      "2026-03-08",
      "America/New_York",
      springPlaced,
      0,
      60,
      true,
      [{ start: "00:00", end: "06:00" }],
    );
    assert.equal(overbooked.includes("03:00"), true);

    const fallBooking = localRange("2026-11-01", "00:30", "01:30");
    const fallPlaced = bookingMinutesOnDate(fallBooking.start, fallBooking.end, "America/New_York", "2026-11-01", 90);
    assert.ok(fallPlaced);
    const fallSlots = resolveSlots(
      "2026-11-01",
      "America/New_York",
      fallPlaced,
      0,
      90,
      false,
      [{ start: "00:00", end: "04:00" }],
    );
    assert.equal(fallSlots.includes("01:30"), false);
    assert.equal(fallSlots.includes("02:00"), true);
    assertMatchesSql("2026-11-01", fallSlots, fallBooking, 0, 90, [{ start: "00:00", end: "04:00" }]);

    const beforeGap = localRange("2026-03-08", "03:30", "04:00");
    const beforePlaced = bookingMinutesOnDate(beforeGap.start, beforeGap.end, "America/New_York", "2026-03-08", 60);
    assert.ok(beforePlaced);
    const beforeSlots = resolveSlots(
      "2026-03-08",
      "America/New_York",
      beforePlaced,
      60,
      0,
      false,
      [{ start: "00:00", end: "06:00" }],
    );
    assert.equal(beforeSlots.includes("01:00"), true);
    assert.equal(beforeSlots.includes("01:30"), false);
    assertMatchesSql("2026-03-08", beforeSlots, beforeGap, 60, 0, [{ start: "00:00", end: "06:00" }]);
  });
});

function localRange(date: string, start: string, end: string): { start: string; end: string } {
  return {
    start: localDateTimeToInstantIso(date, start, "America/New_York"),
    end: localDateTimeToInstantIso(date, end, "America/New_York"),
  };
}

function resolveSlots(
  date: string,
  timezone: string,
  placed: { startMinutes: number; durationMinutes: number },
  before: number,
  after: number,
  overbook: boolean,
  periods: { start: string; end: string }[],
): string[] {
  const booking: ExistingBooking = { id: "span", ...placed, status: "Confirmed" };
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
    existingBookings: [booking],
    options: { referenceNow: new Date("2026-01-01T00:00:00.000Z"), date, timezone },
  }).slots;
}

function assertMatchesSql(
  date: string,
  kept: string[],
  booking: { start: string; end: string },
  before: number,
  after: number,
  periods: { start: string; end: string }[],
): void {
  const offered = SlotGenerationResolver.generateSlots(periods, 30, {
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    bufferBeforeMinutes: before,
    bufferAfterMinutes: after,
    allowOverbooking: false,
  });
  for (const slot of offered) {
    const slotStart = localDateTimeToInstantIso(date, slot, "America/New_York");
    const slotEnd = addMinutesToInstantIso(slotStart, 30);
    const blocks =
      sqlCovers(booking.start, booking.end, slotStart, slotEnd, before, after) ||
      sqlCovers(booking.start, booking.end, slotStart, slotEnd, after, before);
    assert.equal(kept.includes(slot), !blocks, slot);
  }
}

function sqlCovers(
  existingStart: string,
  existingEnd: string,
  slotStart: string,
  slotEnd: string,
  before: number,
  after: number,
): boolean {
  return (
    Date.parse(existingStart) < Date.parse(slotEnd) + before * 60_000 &&
    Date.parse(existingEnd) > Date.parse(slotStart) - after * 60_000
  );
}
