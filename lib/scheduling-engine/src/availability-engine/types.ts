/** Availability Engine domain types (S4.3) — effective periods, not slots. */

import type { WeekdayIndex } from "../types";

/** Local wall-clock interval on a calendar date (HH:mm, resource timezone). */
export type LocalTimePeriod = {
  start: string;
  end: string;
};

export type AvailabilityUnavailabilityReason =
  | "resource_not_found"
  | "service_not_found"
  | "resource_inactive"
  | "service_inactive"
  | "capability_missing"
  | "holiday"
  | "weekly_closed"
  | "missing_weekly_schedule"
  | "exception_blocked"
  | "outside_booking_window"
  | "inside_minimum_notice"
  | "invalid_timezone"
  | "invalid_date";

export type ResolvedAvailability = {
  available: boolean;
  date: string;
  timezone: string;
  resourceId: string;
  serviceId: string | null;
  periods: LocalTimePeriod[];
  reasons: AvailabilityUnavailabilityReason[];
  meta: {
    holidayTitle?: string;
    exceptionTitles?: string[];
    weekday?: WeekdayIndex;
  };
};

export type AvailabilityResolveOptions = {
  /** When true, apply min notice + max booking window from booking rules. */
  respectBookingRules?: boolean;
  /** Reference instant for booking-rule checks (defaults to now). */
  referenceNow?: Date;
};

export type AvailabilityEngineInput = {
  resourceId: string;
  serviceId: string | null;
  date: string;
  options?: AvailabilityResolveOptions;
};
