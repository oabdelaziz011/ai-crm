export const DEFAULT_DAYS_AHEAD = 7;
export const MIN_DAYS_AHEAD = 1;
export const MAX_DAYS_AHEAD = 90;

/** @deprecated Use DEFAULT_DAYS_AHEAD */
export const AVAILABLE_DATES_WINDOW_DAYS = DEFAULT_DAYS_AHEAD;

/** @deprecated Use formatEmptyAvailabilityMessage(searchedWindow) */
export const AVAILABLE_DATES_EMPTY_MESSAGE = formatEmptyAvailabilityMessage(DEFAULT_DAYS_AHEAD);

export class InvalidDaysAheadError extends Error {
  constructor(value: unknown) {
    super(`daysAhead must be a finite number between ${MIN_DAYS_AHEAD} and ${MAX_DAYS_AHEAD}. Received: ${String(value)}`);
    this.name = "InvalidDaysAheadError";
  }
}

export function addDaysIso(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function normalizeDaysAhead(
  value: unknown,
  maxBookingWindowDays: number = MAX_DAYS_AHEAD,
): number {
  if (value === undefined || value === null) {
    return Math.min(DEFAULT_DAYS_AHEAD, clampMaxBookingWindow(maxBookingWindowDays));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return Math.min(DEFAULT_DAYS_AHEAD, clampMaxBookingWindow(maxBookingWindowDays));
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new InvalidDaysAheadError(value);
    }
    return clampDaysAhead(parsed, maxBookingWindowDays);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidDaysAheadError(value);
  }

  return clampDaysAhead(value, maxBookingWindowDays);
}

function clampMaxBookingWindow(maxBookingWindowDays: number): number {
  if (!Number.isFinite(maxBookingWindowDays) || maxBookingWindowDays < MIN_DAYS_AHEAD) {
    return MAX_DAYS_AHEAD;
  }
  return Math.min(Math.floor(maxBookingWindowDays), MAX_DAYS_AHEAD);
}

function clampDaysAhead(value: number, maxBookingWindowDays: number): number {
  const rounded = Math.floor(value);
  if (rounded < MIN_DAYS_AHEAD) {
    throw new InvalidDaysAheadError(value);
  }
  const companyCap = clampMaxBookingWindow(maxBookingWindowDays);
  return Math.min(rounded, MAX_DAYS_AHEAD, companyCap);
}

export function buildDateScanRange(
  startDate: string,
  windowDays: number = DEFAULT_DAYS_AHEAD,
): string[] {
  const days = Math.max(MIN_DAYS_AHEAD, Math.floor(windowDays));
  return Array.from({ length: days }, (_, index) => addDaysIso(startDate, index));
}

export function filterAvailableDates(
  dates: Iterable<string>,
  startDate: string,
  windowDays: number = DEFAULT_DAYS_AHEAD,
): string[] {
  const maxDate = addDaysIso(startDate, Math.max(MIN_DAYS_AHEAD, Math.floor(windowDays)) - 1);
  return [...new Set(dates)]
    .filter((date) => date >= startDate && date <= maxDate)
    .sort();
}

const WINDOW_SUGGESTIONS = [7, 14, 30, 60, 90] as const;

export function suggestNextWindow(searchedWindow: number): number | null {
  const normalized = Math.max(MIN_DAYS_AHEAD, Math.floor(searchedWindow));
  const exactIndex = WINDOW_SUGGESTIONS.indexOf(normalized as (typeof WINDOW_SUGGESTIONS)[number]);
  if (exactIndex >= 0 && exactIndex < WINDOW_SUGGESTIONS.length - 1) {
    return WINDOW_SUGGESTIONS[exactIndex + 1] ?? null;
  }
  for (const candidate of WINDOW_SUGGESTIONS) {
    if (candidate > normalized) return candidate;
  }
  return null;
}

export function formatEmptyAvailabilityMessage(searchedWindow: number): string {
  return `No appointments are available during the next ${searchedWindow} days.`;
}

export type EmptyAvailabilityResult = {
  success: false;
  message: string;
  searchedWindow: number;
  nextSuggestion: number | null;
};

export function buildEmptyAvailabilityResult(searchedWindow: number): EmptyAvailabilityResult {
  const window = Math.max(MIN_DAYS_AHEAD, Math.floor(searchedWindow));
  return {
    success: false,
    message: formatEmptyAvailabilityMessage(window),
    searchedWindow: window,
    nextSuggestion: suggestNextWindow(window),
  };
}
