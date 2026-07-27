import { addDays, format, startOfWeek } from "date-fns";
import type { OperationsDatePreset } from "@/lib/scheduling/operations/types";

export function resolveOperationsDate(preset: OperationsDatePreset, customDate: string): string {
  const today = new Date();
  switch (preset) {
    case "today":
      return format(today, "yyyy-MM-dd");
    case "tomorrow":
      return format(addDays(today, 1), "yyyy-MM-dd");
    case "this_week":
      return format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
    case "custom":
    default:
      return customDate;
  }
}

export function operationsDayRange(date: string): { rangeStart: string; rangeEnd: string } {
  const start = `${date}T00:00:00.000Z`;
  const endDate = new Date(`${date}T12:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { rangeStart: start, rangeEnd: endDate.toISOString() };
}

export function formatOperationsCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
