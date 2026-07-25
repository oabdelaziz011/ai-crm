import type { LocalTimePeriod } from "@/lib/scheduling/availability-engine/types";
import {
  formatMinutesToTime,
  parseTimeToMinutes,
  type MinutePeriod,
} from "@/lib/scheduling/availability-engine/period-utils";
import type { SlotGenerationRules, SlotStartTime } from "@/lib/scheduling/slot-generation-engine/types";

export class SlotGenerator {
  /**
   * Generate discrete slot start times from effective working periods.
   * Pure — does not apply booking conflicts or min-notice trimming.
   */
  static generateSlots(
    periods: LocalTimePeriod[],
    durationMinutes: number,
    rules: Pick<SlotGenerationRules, "slotIntervalMinutes">,
  ): SlotStartTime[] {
    if (durationMinutes <= 0 || rules.slotIntervalMinutes <= 0) {
      return [];
    }

    const starts: number[] = [];

    for (const period of periods) {
      const periodMinutes: MinutePeriod = {
        start: parseTimeToMinutes(period.start),
        end: parseTimeToMinutes(period.end),
      };

      for (
        let cursor = periodMinutes.start;
        cursor + durationMinutes <= periodMinutes.end;
        cursor += rules.slotIntervalMinutes
      ) {
        starts.push(cursor);
      }
    }

    return SlotGenerator.uniqueSorted(starts).map(formatMinutesToTime);
  }

  static uniqueSorted(minutes: number[]): number[] {
    return [...new Set(minutes)].sort((a, b) => a - b);
  }

  /** True when [slotStart, slotStart + duration) overlaps [blocked.start, blocked.end). */
  static slotOverlapsBlocked(
    slotStartMinutes: number,
    durationMinutes: number,
    blocked: MinutePeriod,
  ): boolean {
    const slotEnd = slotStartMinutes + durationMinutes;
    return slotStartMinutes < blocked.end && slotEnd > blocked.start;
  }
}
