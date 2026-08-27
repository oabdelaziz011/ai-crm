import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { AvailabilityPolicy } from "@/lib/scheduling/availability-engine/availability-policy";
import type { ResolvedAvailability } from "@/lib/scheduling/availability-engine/types";
import {
  parseTimeToMinutes,
  formatMinutesToTime,
} from "@/lib/scheduling/availability-engine/period-utils";
import type {
  SlotGenerationOptions,
  SlotGenerationRules,
  SlotGenerationSnapshot,
  SlotStartTime,
} from "@/lib/scheduling/slot-generation-engine/types";

export class SlotPolicy {
  static validateDuration(durationMinutes: number): boolean {
    return Number.isFinite(durationMinutes) && durationMinutes > 0;
  }

  static canGenerateFromAvailability(availability: ResolvedAvailability): boolean {
    return availability.available && availability.periods.length > 0;
  }

  static buildRulesFromSnapshot(snapshot: SlotGenerationSnapshot): SlotGenerationRules {
    return {
      durationMinutes: snapshot.durationMinutes,
      slotIntervalMinutes: snapshot.bookingRules.slotIntervalMinutes,
      bufferBeforeMinutes: snapshot.bookingRules.bufferBeforeMinutes,
      bufferAfterMinutes: snapshot.bookingRules.bufferAfterMinutes,
      allowOverbooking: snapshot.bookingRules.allowOverbooking,
    };
  }

  /**
   * Trim same-day slots that start before now + minimum notice.
   * Availability Engine may block the whole day; this handles slot-level trimming.
   */
  static applyMinimumNotice(
    slots: SlotStartTime[],
    options: SlotGenerationOptions,
  ): SlotStartTime[] {
    if (!options.respectBookingRules) {
      return slots;
    }

    const minNotice = Math.max(0, options.minBookingNoticeMinutes ?? 0);
    const timezone = options.timezone;
    const date = options.date;
    const referenceNow = options.referenceNow ?? new Date();

    if (!timezone || !date) {
      return slots;
    }

    const today = TimezoneResolver.localDateForInstant(referenceNow, timezone);
    if (today !== date) {
      return slots;
    }

    const nowMinutes = AvailabilityPolicy.minutesSinceMidnight(referenceNow, timezone);
    const earliestStart = nowMinutes + Math.max(minNotice, 1);

    return slots.filter((slot) => parseTimeToMinutes(slot) >= earliestStart);
  }
}

export class SlotFormatter {
  static toGeneratedSlots(
    slots: SlotStartTime[],
    durationMinutes: number,
  ): Array<{ start: SlotStartTime; end: SlotStartTime }> {
    return slots.map((start) => ({
      start,
      end: formatMinutesToTime(parseTimeToMinutes(start) + durationMinutes),
    }));
  }

  static emptyResult(snapshot: SlotGenerationSnapshot): {
    slots: SlotStartTime[];
    generatedSlots: Array<{ start: SlotStartTime; end: SlotStartTime }>;
    slotsBeforeConflictRemoval: number;
  } {
    return {
      slots: [],
      generatedSlots: [],
      slotsBeforeConflictRemoval: 0,
    };
  }
}
