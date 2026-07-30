import type { AvailableDateRecord } from "./available-date-types";

export function formatAvailableDateLabel(date: string, timezone: string): string {
  const parsed = Date.parse(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone || "UTC",
  }).format(new Date(parsed));
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
    description: record.date,
    value,
    record: record as unknown as Record<string, unknown>,
  };
}
