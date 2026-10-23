import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BookingConflictResolver } from "./booking-conflict-resolver.js";
import type { ExistingBooking } from "./types.js";

describe("BookingConflictResolver", () => {
  it("removes a booked slot at 21:15 after a confirmed booking at the same local time", () => {
    const slots = ["19:00", "21:15", "21:30"];
    const bookings: ExistingBooking[] = [
      {
        id: "booking-1",
        startMinutes: 21 * 60 + 15,
        durationMinutes: 30,
        status: "Confirmed",
      },
    ];

    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      30,
      bookings,
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
    );

    assert.deepEqual(remaining, ["19:00"]);
  });

  it("removes slots blocked by pending bookings", () => {
    const slots = ["09:15", "10:00"];
    const bookings: ExistingBooking[] = [
      {
        id: "booking-pending",
        startMinutes: 9 * 60 + 15,
        durationMinutes: 30,
        status: "Pending",
      },
    ];

    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      30,
      bookings,
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
    );

    assert.deepEqual(remaining, ["10:00"]);
  });

  it("keeps slots when allowOverbooking is enabled", () => {
    const slots = ["09:15"];
    const bookings: ExistingBooking[] = [
      {
        id: "booking-1",
        startMinutes: 9 * 60 + 15,
        durationMinutes: 30,
        status: "Confirmed",
      },
    ];

    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      30,
      bookings,
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: true },
    );

    assert.deepEqual(remaining, slots);
  });

  it("expands an existing booking once, before its start and after its end", () => {
    const slots = ["08:15", "08:30", "09:30", "09:45"];
    const bookings: ExistingBooking[] = [
      {
        id: "booking-buffer",
        startMinutes: 9 * 60,
        durationMinutes: 30,
        status: "Confirmed",
      },
    ];

    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      30,
      bookings,
      { bufferBeforeMinutes: 15, bufferAfterMinutes: 15, allowOverbooking: false },
    );

    assert.deepEqual(remaining, ["08:15", "09:45"]);
  });

  it("keeps a gap of the larger buffer when before and after differ", () => {
    const bookings: ExistingBooking[] = [
      {
        id: "booking-buffer",
        startMinutes: 12 * 60 + 30,
        durationMinutes: 30,
        status: "Confirmed",
      },
    ];
    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["11:45", "12:00", "13:00", "13:15"],
      30,
      bookings,
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 15, allowOverbooking: false },
    );
    assert.deepEqual(remaining, ["11:45", "13:15"]);
  });

  it("blocks the next morning when an evening buffer crosses midnight", () => {
    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["00:00", "00:20", "00:25"],
      30,
      [{ id: "late", startMinutes: -20, durationMinutes: 15, status: "Confirmed" }],
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 30, allowOverbooking: false },
    );
    assert.deepEqual(remaining, ["00:25"]);
  });

  it("blocks the previous evening when a morning buffer crosses midnight", () => {
    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["23:00", "23:15"],
      30,
      [{ id: "early", startMinutes: 24 * 60 + 10, durationMinutes: 30, status: "Confirmed" }],
      { bufferBeforeMinutes: 30, bufferAfterMinutes: 0, allowOverbooking: false },
    );
    assert.deepEqual(remaining, ["23:00"]);
  });

  it("keeps the exact midnight boundary when the buffers differ", () => {
    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["23:25", "23:30"],
      30,
      [{ id: "next", startMinutes: 24 * 60 + 20, durationMinutes: 30, status: "Confirmed" }],
      { bufferBeforeMinutes: 10, bufferAfterMinutes: 25, allowOverbooking: false },
    );
    assert.deepEqual(remaining, ["23:25"]);
  });

  it("keeps a midnight-adjacent slot when overbooking is allowed", () => {
    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["00:00"],
      30,
      [{ id: "late", startMinutes: -20, durationMinutes: 15, status: "Confirmed" }],
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 30, allowOverbooking: true },
    );
    assert.deepEqual(remaining, ["00:00"]);
  });

  it("ignores cancelled bookings when building blocked intervals", () => {
    const slots = ["09:15"];
    const bookings: ExistingBooking[] = [
      {
        id: "booking-cancelled",
        startMinutes: 9 * 60 + 15,
        durationMinutes: 30,
        status: "Cancelled",
      },
    ];

    const remaining = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      30,
      bookings,
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 0, allowOverbooking: false },
    );

    assert.deepEqual(remaining, slots);
  });
});
