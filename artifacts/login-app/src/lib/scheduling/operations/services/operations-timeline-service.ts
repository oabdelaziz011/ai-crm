import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationsBookingView, OperationsTimelineSlot } from "@/lib/scheduling/operations/types";
import { getSchedulingServices } from "@/lib/scheduling";
import {
  findBookingForSlot,
  slotKindForBooking,
} from "@/lib/scheduling/operations/selectors";
import { generateDaySlotIntervals } from "@/lib/scheduling/operations/utilities";

export type BuildTimelineParams = {
  companyId: string;
  date: string;
  timezone: string;
  bookings: OperationsBookingView[];
  resourceIds: string[];
};

export class OperationsTimelineService {
  constructor(private readonly client: SupabaseClient) {}

  async buildTimeline(params: BuildTimelineParams): Promise<OperationsTimelineSlot[]> {
    const scheduling = getSchedulingServices();
    const rules = await scheduling.bookingRules.get(params.companyId);
    const slotIntervalMinutes = rules?.slot_interval_minutes ?? 15;

    const resources =
      params.resourceIds.length > 0
        ? params.resourceIds
        : [...new Set(params.bookings.map((b) => b.resourceId))];

    const targetResources = resources.length > 0 ? resources : [null];

    const intervals = generateDaySlotIntervals(slotIntervalMinutes);
    const slots: OperationsTimelineSlot[] = [];

    for (const resourceId of targetResources) {
      const resourceName =
        params.bookings.find((b) => b.resourceId === resourceId)?.resource?.name ?? null;

      for (const interval of intervals) {
        const booking = findBookingForSlot(
          params.bookings,
          interval.startMinutes,
          interval.endMinutes,
          params.timezone,
          resourceId ?? undefined,
        );

        slots.push({
          id: `${params.date}-${resourceId ?? "all"}-${interval.startTime}`,
          date: params.date,
          startTime: interval.startTime,
          endTime: interval.endTime,
          startMinutes: interval.startMinutes,
          endMinutes: interval.endMinutes,
          kind: slotKindForBooking(booking),
          booking,
          resourceId,
          resourceName,
        });
      }
    }

    return slots.sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      return (a.resourceName ?? "").localeCompare(b.resourceName ?? "");
    });
  }
}
