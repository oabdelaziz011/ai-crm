import type {
  DatePickerConstraintsSnapshot,
  DatePickerRuntimeConfig,
} from "../ports/business-calendar-port.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readDatePickerRuntimeConfig(config: Record<string, unknown>): DatePickerRuntimeConfig {
  return {
    disablePastDates: config.disablePastDates !== false,
    disableCompanyHolidays: config.disableCompanyHolidays === true,
    holidayBehavior: config.holidayBehavior === "warning" ? "warning" : "disable",
    disableClosedWeekdays: config.disableClosedWeekdays !== false,
    branchId: readString(config.branchId) || null,
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSelectedDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (ISO_DATE_PATTERN.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function validateSelectedDate(
  date: string,
  constraints: DatePickerConstraintsSnapshot,
): { ok: true } | { ok: false; reasonKey: string; reasonParams?: Record<string, string> } {
  const entry = constraints.entries.find((item) => item.date === date);
  if (!entry) return { ok: true };
  if (entry.warningOnly) return { ok: true };
  return {
    ok: false,
    reasonKey: entry.messageKey,
    reasonParams: entry.messageParams,
  };
}

export function isDateHardDisabled(
  constraints: DatePickerConstraintsSnapshot,
  date: string,
): boolean {
  return constraints.disabledDates.includes(date);
}

export function isDateHolidayWarning(
  constraints: DatePickerConstraintsSnapshot,
  date: string,
): boolean {
  return constraints.warningDates.includes(date);
}
