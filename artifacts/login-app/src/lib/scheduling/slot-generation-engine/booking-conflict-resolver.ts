import {
  parseTimeToMinutes,
  type MinutePeriod,
} from "@/lib/scheduling/availability-engine/period-utils";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { absoluteMinutesFromLocalMidnight } from "@/lib/scheduling/booking-domain/booking-time-utils";
import { SlotGenerator } from "@/lib/scheduling/slot-generation-engine/slot-generator";
import type {
  ExistingBooking,
  SlotGenerationRules,
  SlotStartTime,
} from "@/lib/scheduling/slot-generation-engine/types";

export class BookingConflictResolver {
  /** Expand bookings into blocked intervals including buffers. */
  static toBlockedIntervals(
    bookings: ExistingBooking[],
    bufferBeforeMinutes: number,
    bufferAfterMinutes: number,
  ): MinutePeriod[] {
    return bookings
      .filter((booking) => booking.status !== "Cancelled")
      .map((booking) => ({
        start: booking.startMinutes - bufferBeforeMinutes,
        end: booking.startMinutes + booking.durationMinutes + bufferAfterMinutes,
      }))
      .filter((interval) => interval.end > interval.start);
  }

  /** Remove slots whose service interval overlaps any blocked interval. */
  static removeBookedSlots(
    slots: SlotStartTime[],
    durationMinutes: number,
    blockedIntervals: MinutePeriod[],
  ): SlotStartTime[] {
    if (blockedIntervals.length === 0) {
      return [...slots];
    }

    return slots.filter((slot) => {
      const startMinutes = parseTimeToMinutes(slot);
      return !blockedIntervals.some((blocked) =>
        SlotGenerator.slotOverlapsBlocked(startMinutes, durationMinutes, blocked),
      );
    });
  }

  /**
   * True when either booking's company buffer covers the other.
   * The gap must be at least the larger buffer, not the sum of both.
   */
  static conflicts(
    slotStartMinutes: number,
    durationMinutes: number,
    booking: ExistingBooking,
    bufferBeforeMinutes: number,
    bufferAfterMinutes: number,
  ): boolean {
    if (booking.status === "Cancelled") return false;
    const slotEnd = slotStartMinutes + durationMinutes;
    const existingStart = booking.startMinutes;
    const existingEnd = booking.startMinutes + booking.durationMinutes;
    const existingBufferCoversSlot =
      existingStart < slotEnd + bufferBeforeMinutes &&
      existingEnd > slotStartMinutes - bufferAfterMinutes;
    const slotBufferCoversExisting =
      existingStart < slotEnd + bufferAfterMinutes &&
      existingEnd > slotStartMinutes - bufferBeforeMinutes;
    return existingBufferCoversSlot || slotBufferCoversExisting;
  }

  static removeBookedSlotsFromBookings(
    slots: SlotStartTime[],
    durationMinutes: number,
    bookings: ExistingBooking[],
    rules: Pick<
      SlotGenerationRules,
      "bufferBeforeMinutes" | "bufferAfterMinutes" | "allowOverbooking"
    >,
    clock?: { date: string; timezone: string },
  ): SlotStartTime[] {
    if (rules.allowOverbooking) {
      return [...slots];
    }

    return slots.filter((slot) => {
      const startMinutes = clock
        ? absoluteMinutesFromLocalMidnight(clock.date, slot, clock.timezone)
        : parseTimeToMinutes(slot);
      return !bookings.some((booking) =>
        BookingConflictResolver.conflicts(
          startMinutes,
          durationMinutes,
          booking,
          rules.bufferBeforeMinutes,
          rules.bufferAfterMinutes,
        ),
      );
    });
  }

  /** Convert legacy booking instant to local start minutes for a calendar date. */
  static bookingToLocalStartMinutes(
    bookingDateIso: string,
    durationMinutes: number | null,
    timezone: string,
    expectedDate: string,
  ): ExistingBooking | null {
    let instant: Date;
    try {
      instant = TimezoneResolver.parseInstant(bookingDateIso);
    } catch {
      return null;
    }

    const localDate = TimezoneResolver.localDateForInstant(instant, timezone);
    if (localDate !== expectedDate) {
      return null;
    }

    return {
      id: "",
      startMinutes: parseTimeToMinutes(TimezoneResolver.localTimeForInstant(instant, timezone)),
      durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : 30,
      status: "Confirmed",
    };
  }
}
