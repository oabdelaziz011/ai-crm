import {
  parseTimeToMinutes,
  type MinutePeriod,
} from "../availability-engine/period-utils";
import { TimezoneResolver } from "../availability-engine/timezone-resolver";
import { SlotGenerator } from "../slot-generation-engine/slot-generator";
import type {
  ExistingBooking,
  SlotGenerationRules,
  SlotStartTime,
} from "../slot-generation-engine/types";

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
        start: Math.max(0, booking.startMinutes - bufferBeforeMinutes),
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

  static removeBookedSlotsFromBookings(
    slots: SlotStartTime[],
    durationMinutes: number,
    bookings: ExistingBooking[],
    rules: Pick<
      SlotGenerationRules,
      "bufferBeforeMinutes" | "bufferAfterMinutes" | "allowOverbooking"
    >,
  ): SlotStartTime[] {
    if (rules.allowOverbooking) {
      return [...slots];
    }

    const blocked = BookingConflictResolver.toBlockedIntervals(
      bookings,
      rules.bufferBeforeMinutes,
      rules.bufferAfterMinutes,
    );
    return BookingConflictResolver.removeBookedSlots(slots, durationMinutes, blocked);
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
