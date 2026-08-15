import type { AvailableDateRecord } from "./available-date-types";
import {
  resolveSchedulingDisplayLocale,
  truncateWhatsAppListTitle,
} from "../scheduling-display-locale";

export function formatAvailableDateLabel(
  date: string,
  timezone: string,
  locale?: string | null,
): string {
  const parsed = Date.parse(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed)) return date;
  const intlLocale = resolveSchedulingDisplayLocale({
    language: locale,
    timezone,
  });
  const instant = new Date(parsed);
  const nowYear = new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    timeZone: timezone || "UTC",
  }).format(new Date());
  const dateYear = new Intl.DateTimeFormat(intlLocale, {
    year: "numeric",
    timeZone: timezone || "UTC",
  }).format(instant);

  const label = new Intl.DateTimeFormat(intlLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(dateYear === nowYear ? {} : { year: "numeric" }),
    timeZone: timezone || "UTC",
    numberingSystem: "latn",
  }).format(instant);

  return truncateWhatsAppListTitle(label);
}

export function availableDateRecordToLookupRow(
  record: AvailableDateRecord,
  displayField: string,
  valueField: string,
) {
  const row = record as unknown as Record<string, unknown>;
  const display =
    displayField === "display_date"
      ? record.display_date
      : String(row[displayField] ?? record.display_date);
  const value =
    valueField === "date" ? record.date : String(row[valueField] ?? record.date);

  return {
    id: record.date,
    title: display,
    // Omit description — WhatsApp already shows title; ISO date duplicated the label.
    value,
    record: record as unknown as Record<string, unknown>,
  };
}
