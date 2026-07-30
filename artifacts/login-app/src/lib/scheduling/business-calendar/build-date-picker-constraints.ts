import { AvailabilityPolicy } from "@/lib/scheduling/availability-engine/availability-policy";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  DEFAULT_BOOKING_RULES,
  type SchedulingBookingRules,
  type SchedulingHoliday,
  type WeekdayIndex,
} from "@/lib/scheduling/types";
import type {
  DatePickerConstraintEntry,
  DatePickerConstraintOptions,
  DatePickerConstraintsSnapshot,
  HolidayBehavior,
} from "./types";

const DEFAULT_CLOSED_WEEKDAYS: WeekdayIndex[] = [0, 6];

function readOptions(options: DatePickerConstraintOptions) {
  return {
    disablePastDates: options.disablePastDates !== false,
    disableCompanyHolidays: options.disableCompanyHolidays === true,
    holidayBehavior: (options.holidayBehavior ?? "disable") as HolidayBehavior,
    disableClosedWeekdays: options.disableClosedWeekdays !== false,
    branchId: options.branchId ?? null,
  };
}

function addDays(date: string, amount: number): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  const next = new Date(parsed + amount * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function findHolidayForDate(
  holidays: SchedulingHoliday[],
  date: string,
  branchId: string | null,
): SchedulingHoliday | undefined {
  return holidays.find((holiday) => {
    if (holiday.holiday_date !== date) return false;
    if (!holiday.branch_id) return true;
    return branchId ? holiday.branch_id === branchId : true;
  });
}

function isClosedWeekday(date: string, timezone: string, closedWeekdays: WeekdayIndex[]): boolean {
  const weekday = TimezoneResolver.weekdayForDate(date, timezone);
  return closedWeekdays.includes(weekday);
}

export function buildDatePickerConstraints(input: {
  holidays: SchedulingHoliday[];
  bookingRules: SchedulingBookingRules | null;
  openWeekdays: WeekdayIndex[];
  options: DatePickerConstraintOptions;
  referenceNow?: Date;
  fromDate?: string;
  toDate?: string;
}): DatePickerConstraintsSnapshot {
  const opts = readOptions(input.options);
  const rules = input.bookingRules ?? ({ ...DEFAULT_BOOKING_RULES } as SchedulingBookingRules);
  const timezone = rules.timezone || DEFAULT_BOOKING_RULES.timezone;
  const referenceNow = input.referenceNow ?? new Date();
  const today = TimezoneResolver.localDateForInstant(referenceNow, timezone);
  const fromDate = input.fromDate ?? today;
  const toDate =
    input.toDate ?? addDays(today, rules.max_booking_window_days ?? DEFAULT_BOOKING_RULES.max_booking_window_days);

  const openWeekdaySet = new Set(input.openWeekdays);
  const closedWeekdays =
    openWeekdaySet.size > 0
      ? ([0, 1, 2, 3, 4, 5, 6] as WeekdayIndex[]).filter((day) => !openWeekdaySet.has(day))
      : DEFAULT_CLOSED_WEEKDAYS;

  const entries: DatePickerConstraintEntry[] = [];
  const disabledDates = new Set<string>();
  const warningDates = new Set<string>();

  for (const date of enumerateDates(fromDate, toDate)) {
    if (opts.disablePastDates) {
      const dayDiff = AvailabilityPolicy.daysBetween(today, date);
      if (dayDiff < 0) {
        entries.push({
          date,
          reason: "past_date",
          messageKey: "scheduling.datePicker.reasons.pastDate",
          warningOnly: false,
        });
        disabledDates.add(date);
        continue;
      }
    }

    if (opts.disableCompanyHolidays) {
      const holiday = findHolidayForDate(input.holidays, date, opts.branchId);
      if (holiday) {
        const warningOnly = opts.holidayBehavior === "warning";
        entries.push({
          date,
          reason: "holiday",
          messageKey: "scheduling.datePicker.reasons.holiday",
          messageParams: { title: holiday.title },
          warningOnly,
        });
        if (warningOnly) {
          warningDates.add(date);
        } else {
          disabledDates.add(date);
        }
        continue;
      }
    }

    if (opts.disableClosedWeekdays && isClosedWeekday(date, timezone, closedWeekdays)) {
      entries.push({
        date,
        reason: "closed_weekday",
        messageKey: "scheduling.datePicker.reasons.closedWeekday",
        warningOnly: false,
      });
      disabledDates.add(date);
      continue;
    }

    const windowReasons = AvailabilityPolicy.evaluateBookingRules(date, timezone, rules, referenceNow);
    if (windowReasons.includes("outside_booking_window")) {
      entries.push({
        date,
        reason: "outside_booking_window",
        messageKey: "scheduling.datePicker.reasons.outsideBookingWindow",
        warningOnly: false,
      });
      disabledDates.add(date);
    } else if (windowReasons.includes("inside_minimum_notice")) {
      entries.push({
        date,
        reason: "outside_booking_window",
        messageKey: "scheduling.datePicker.reasons.minimumNotice",
        warningOnly: false,
      });
      disabledDates.add(date);
    }
  }

  return {
    timezone,
    maxBookingWindowDays: rules.max_booking_window_days ?? DEFAULT_BOOKING_RULES.max_booking_window_days,
    closedWeekdays,
    entries,
    disabledDates: [...disabledDates],
    warningDates: [...warningDates],
  };
}

export function findDatePickerConstraint(
  snapshot: DatePickerConstraintsSnapshot,
  date: string,
): DatePickerConstraintEntry | undefined {
  return snapshot.entries.find((entry) => entry.date === date);
}

export function isDateSelectable(
  snapshot: DatePickerConstraintsSnapshot,
  date: string,
): boolean {
  return !snapshot.disabledDates.includes(date);
}
