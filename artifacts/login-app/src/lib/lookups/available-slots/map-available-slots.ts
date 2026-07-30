import { localDateTimeToInstantIso } from "@/lib/scheduling/booking-domain/booking-time-utils";
import type { ResolvedSlots } from "@/lib/scheduling/slot-generation-engine/types";
import type { AvailableSlotRecord } from "./available-slot-types";

function formatDisplayTime(time: string): string {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function mapResolvedSlotsToAvailableSlotRecords(
  resolved: ResolvedSlots,
  branchId: string | null,
): AvailableSlotRecord[] {
  return resolved.generatedSlots.map((slot) => {
    const startAt = localDateTimeToInstantIso(resolved.date, slot.start, resolved.timezone);
    const endAt = localDateTimeToInstantIso(resolved.date, slot.end, resolved.timezone);
    return {
      start_at: startAt,
      end_at: endAt,
      display_time: formatDisplayTime(slot.start),
      duration_minutes: resolved.durationMinutes,
      service_id: resolved.serviceId,
      resource_id: resolved.resourceId,
      branch_id: branchId,
      timezone: resolved.timezone,
    };
  });
}

export function availableSlotRecordToLookupRow(
  slot: AvailableSlotRecord,
  displayField: string,
  valueField: string,
) {
  const record = slot as unknown as Record<string, unknown>;
  const display =
    displayField === "display_time"
      ? slot.display_time
      : String(record[displayField] ?? slot.display_time);
  const value =
    valueField === "start_at"
      ? slot.start_at
      : String(record[valueField] ?? slot.start_at);

  return {
    id: slot.start_at,
    title: display,
    description: `${slot.display_time} · ${slot.duration_minutes} min`,
    value,
    record: slot as unknown as Record<string, unknown>,
  };
}
