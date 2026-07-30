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
