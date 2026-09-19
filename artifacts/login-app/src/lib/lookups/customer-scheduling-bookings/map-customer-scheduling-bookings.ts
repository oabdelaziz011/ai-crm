import { TimezoneResolver } from "@workspace/scheduling-engine";
import {
  resolveSchedulingDisplayLocale,
} from "../scheduling-display-locale";
import type { LookupOptionRow } from "../types";
import {
  CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX,
  type CustomerSchedulingBookingRecord,
} from "./customer-scheduling-booking-types";

export function truncateCustomerSchedulingBookingTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX) return trimmed;
  return trimmed.slice(0, CUSTOMER_SCHEDULING_BOOKING_TITLE_MAX);
}

export function formatCustomerSchedulingBookingLabel(
  startAt: string,
  timezone: string,
  locale?: string | null,
): string {
  const instant = Date.parse(startAt);
  if (Number.isNaN(instant)) {
    return truncateCustomerSchedulingBookingTitle(startAt);
  }

  const tz = TimezoneResolver.isValid(timezone) ? timezone : "UTC";
  const intlLocale = resolveSchedulingDisplayLocale({ language: locale, timezone: tz });

  try {
    const label = new Intl.DateTimeFormat(intlLocale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      numberingSystem: "latn",
    }).format(new Date(instant));
    return truncateCustomerSchedulingBookingTitle(label);
  } catch {
    const date = TimezoneResolver.localDateForInstant(new Date(instant), tz);
    const time = TimezoneResolver.localTimeForInstant(new Date(instant), tz);
    return truncateCustomerSchedulingBookingTitle(`${date.slice(5)} ${time}`);
  }
}

export function customerSchedulingBookingRecordToLookupRow(
  record: CustomerSchedulingBookingRecord,
  displayField: string,
  valueField: string,
): LookupOptionRow {
  const row = record as unknown as Record<string, unknown>;
  const display =
    displayField === "display_label"
      ? record.display_label
      : String(row[displayField] ?? record.display_label);
  const value = valueField === "id" ? record.id : String(row[valueField] ?? record.id);

  return {
    id: record.id,
    title: truncateCustomerSchedulingBookingTitle(display),
    value,
    record: record as unknown as Record<string, unknown>,
  };
}
