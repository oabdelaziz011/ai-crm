import { localDateTimeToInstantIso } from "@/lib/scheduling/booking-domain/booking-time-utils";
import type { ResolvedSlots } from "@/lib/scheduling/slot-generation-engine/types";
import type { AvailableSlotRecord } from "./available-slot-types";
import {
  isArabicSchedulingLocale,
  resolveSchedulingDisplayLocale,
  truncateWhatsAppListTitle,
} from "../scheduling-display-locale";

export function formatDisplayTime(
  time: string,
  locale?: string | null,
  timezone?: string | null,
): string {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;

  const intlLocale = resolveSchedulingDisplayLocale({ language: locale, timezone });
  const probe = new Date(Date.UTC(2020, 0, 1, hour, minute, 0));
  try {
    const formatted = new Intl.DateTimeFormat(intlLocale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
      numberingSystem: "latn",
    }).format(probe);
    return truncateWhatsAppListTitle(formatted);
  } catch {
    if (isArabicSchedulingLocale(intlLocale)) {
      const period = hour >= 12 ? "م" : "ص";
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      return truncateWhatsAppListTitle(
        `${hour12}:${String(minute).padStart(2, "0")} ${period}`,
      );
    }
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return truncateWhatsAppListTitle(
      `${hour12}:${String(minute).padStart(2, "0")} ${period}`,
    );
  }
}

export function mapResolvedSlotsToAvailableSlotRecords(
  resolved: ResolvedSlots,
  branchId: string | null,
  locale?: string | null,
): AvailableSlotRecord[] {
  return resolved.generatedSlots.map((slot) => {
    const startAt = localDateTimeToInstantIso(resolved.date, slot.start, resolved.timezone);
    const endAt = localDateTimeToInstantIso(resolved.date, slot.end, resolved.timezone);
    return {
      start_at: startAt,
      end_at: endAt,
      display_time: formatDisplayTime(slot.start, locale, resolved.timezone),
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
    // Omit description — repeating display_time made WhatsApp show the time twice.
    value,
    record: slot as unknown as Record<string, unknown>,
  };
}
