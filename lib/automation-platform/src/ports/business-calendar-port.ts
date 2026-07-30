export type DatePickerDisabledReason =
  | "past_date"
  | "holiday"
  | "closed_weekday"
  | "outside_booking_window"
  | "fully_booked";

export type HolidayBehavior = "disable" | "warning";

export type DatePickerRuntimeConfig = {
  disablePastDates?: boolean;
  disableCompanyHolidays?: boolean;
  holidayBehavior?: HolidayBehavior;
  disableClosedWeekdays?: boolean;
  branchId?: string | null;
};

export type DatePickerConstraintEntrySnapshot = {
  date: string;
  reason: DatePickerDisabledReason;
  messageKey: string;
  messageParams?: Record<string, string>;
  warningOnly: boolean;
};

export type DatePickerConstraintsSnapshot = {
  timezone: string;
  maxBookingWindowDays: number;
  closedWeekdays: number[];
  entries: DatePickerConstraintEntrySnapshot[];
  disabledDates: string[];
  warningDates: string[];
};

export interface BusinessCalendarPort {
  getDatePickerConstraints(
    companyId: string,
    config: DatePickerRuntimeConfig,
  ): Promise<DatePickerConstraintsSnapshot>;
}
