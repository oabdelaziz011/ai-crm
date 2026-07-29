import { BookingConflictResolver } from "../slot-generation-engine/booking-conflict-resolver";
import { SlotGenerator } from "../slot-generation-engine/slot-generator";
import { SlotFormatter, SlotPolicy } from "../slot-generation-engine/slot-policy";
import type {
  LocalTimePeriod,
  ResolvedAvailability,
} from "../availability-engine/types";
import type {
  ExistingBooking,
  ResolvedSlots,
  SlotGenerationRules,
  SlotGenerationSnapshot,
  SlotStartTime,
} from "../slot-generation-engine/types";

export class SlotGenerationResolver {
  /** Pure, deterministic slot resolution from a loaded snapshot. */
  static resolve(snapshot: SlotGenerationSnapshot): ResolvedSlots {
    const base: ResolvedSlots = {
      available: false,
      date: snapshot.date,
      timezone: snapshot.timezone,
      resourceId: snapshot.resourceId,
      serviceId: snapshot.serviceId,
      durationMinutes: snapshot.durationMinutes,
      periods: snapshot.periods,
      slots: [],
      generatedSlots: [],
      reasons: [...snapshot.availabilityReasons],
      meta: {
        slotIntervalMinutes: snapshot.bookingRules.slotIntervalMinutes,
        bookingCount: snapshot.existingBookings.length,
        slotsBeforeConflictRemoval: 0,
      },
    };

    if (!SlotPolicy.validateDuration(snapshot.durationMinutes)) {
      return { ...base, reasons: [...base.reasons, "service_not_found"] };
    }

    if (!snapshot.availabilityAvailable || snapshot.periods.length === 0) {
      return base;
    }

    const rules = SlotPolicy.buildRulesFromSnapshot(snapshot);

    let slots = SlotGenerator.generateSlots(snapshot.periods, snapshot.durationMinutes, rules);
    slots = SlotPolicy.applyMinimumNotice(slots, {
      ...snapshot.options,
      minBookingNoticeMinutes: snapshot.bookingRules.minBookingNoticeMinutes,
      timezone: snapshot.timezone,
      date: snapshot.date,
    });

    const slotsBeforeConflictRemoval = slots.length;
    slots = BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      snapshot.durationMinutes,
      snapshot.existingBookings,
      rules,
    );

    const generatedSlots = SlotFormatter.toGeneratedSlots(slots, snapshot.durationMinutes);

    return {
      ...base,
      available: slots.length > 0,
      slots,
      generatedSlots,
      meta: {
        ...base.meta,
        slotsBeforeConflictRemoval,
      },
    };
  }

  /** Convenience for pure slot generation without availability/booking context. */
  static generateSlots(
    periods: LocalTimePeriod[],
    durationMinutes: number,
    rules: SlotGenerationRules,
  ): SlotStartTime[] {
    return SlotGenerator.generateSlots(periods, durationMinutes, rules);
  }

  static removeBookedSlots(
    slots: SlotStartTime[],
    durationMinutes: number,
    bookings: ExistingBooking[],
    rules: Pick<
      SlotGenerationRules,
      "bufferBeforeMinutes" | "bufferAfterMinutes" | "allowOverbooking"
    >,
  ): SlotStartTime[] {
    return BookingConflictResolver.removeBookedSlotsFromBookings(
      slots,
      durationMinutes,
      bookings,
      rules,
    );
  }

  static fromAvailability(
    availability: ResolvedAvailability,
    durationMinutes: number,
    rules: SlotGenerationRules,
    bookings: ExistingBooking[] = [],
    options: SlotGenerationSnapshot["options"] = {},
  ): ResolvedSlots {
    return SlotGenerationResolver.resolve({
      resourceId: availability.resourceId,
      serviceId: availability.serviceId ?? "",
      date: availability.date,
      timezone: availability.timezone,
      durationMinutes,
      periods: availability.periods,
      availabilityReasons: availability.reasons,
      availabilityAvailable: availability.available,
      bookingRules: {
        ...rules,
        minBookingNoticeMinutes: 0,
        maxBookingWindowDays: 90,
      },
      existingBookings: bookings,
      options,
    });
  }
}
