import type { WeekdayIndex } from "@/lib/scheduling/types";

export type DatePickerDisabledReason =
  | "past_date"
  | "holiday"
  | "closed_weekday"
  | "outside_booking_window"
  | "fully_booked";

export type HolidayBehavior = "disable" | "warning";

export type DatePickerConstraintOptions = {
  disablePastDates?: boolean;
  disableCompanyHolidays?: boolean;
  holidayBehavior?: HolidayBehavior;
  disableClosedWeekdays?: boolean;
  branchId?: string | null;
};

export type DatePickerConstraintEntry = {
  date: string;
  reason: DatePickerDisabledReason;
  messageKey: string;
  messageParams?: Record<string, string>;
  /** When false the date is shown but selection is blocked. When true it is warning-only. */
  warningOnly: boolean;
};

export type DatePickerConstraintsSnapshot = {
  timezone: string;
  maxBookingWindowDays: number;
  closedWeekdays: WeekdayIndex[];
  entries: DatePickerConstraintEntry[];
  /** Dates that must not be selectable (includes warning-only holidays when behavior is disable). */
  disabledDates: string[];
  /** Dates shown with warning styling but still selectable. */
  warningDates: string[];
};

export type DatePickerConstraintsRequest = DatePickerConstraintOptions & {
  companyId: string;
  fromDate?: string;
  toDate?: string;
  referenceNow?: Date;
};
