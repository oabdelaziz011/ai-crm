import { DEFAULT_BOOKING_RULES } from "../types";
import type { AvailabilityContextSnapshot } from "../availability-engine/availability-context";
import type { AvailabilityUnavailabilityReason } from "../availability-engine/types";
import { TimezoneResolver } from "../availability-engine/timezone-resolver";
import type { WeekdayIndex } from "../types";

export class AvailabilityPolicy {
  static evaluate(snapshot: AvailabilityContextSnapshot): {
    blocked: boolean;
    reasons: AvailabilityUnavailabilityReason[];
    timezone: string;
    weekday: WeekdayIndex | null;
    holidayTitle?: string;
  } {
    const reasons: AvailabilityUnavailabilityReason[] = [];

    if (!TimezoneResolver.isValidDateString(snapshot.date)) {
      return { blocked: true, reasons: ["invalid_date"], timezone: "UTC", weekday: null };
    }

    if (!snapshot.resource) {
      return { blocked: true, reasons: ["resource_not_found"], timezone: "UTC", weekday: null };
    }

    const rules = snapshot.bookingRules ?? DEFAULT_BOOKING_RULES;

    if (snapshot.resource.timezone && !TimezoneResolver.isValid(snapshot.resource.timezone)) {
      return {
        blocked: true,
        reasons: ["invalid_timezone"],
        timezone: snapshot.resource.timezone,
        weekday: null,
      };
    }

    if (snapshot.branch?.timezone && !TimezoneResolver.isValid(snapshot.branch.timezone)) {
      return {
        blocked: true,
        reasons: ["invalid_timezone"],
        timezone: snapshot.branch.timezone,
        weekday: null,
      };
    }

    const timezone = TimezoneResolver.resolveEffectiveTimezone(
      snapshot.resource.timezone,
      snapshot.branch?.timezone,
      rules.timezone,
    );

    if (!TimezoneResolver.isValid(timezone)) {
      return { blocked: true, reasons: ["invalid_timezone"], timezone, weekday: null };
    }

    const weekday = TimezoneResolver.weekdayForDate(snapshot.date, timezone);

    if (snapshot.resource.status !== "active") {
      reasons.push("resource_inactive");
    }

    if (snapshot.serviceId) {
      if (!snapshot.service) {
        reasons.push("service_not_found");
      } else if (snapshot.service.status !== "active") {
        reasons.push("service_inactive");
      } else if (!snapshot.serviceCapabilityIds.includes(snapshot.service.id)) {
        reasons.push("capability_missing");
      }
    }

    const holiday = AvailabilityPolicy.findHoliday(snapshot);
    if (holiday) {
      reasons.push("holiday");
      return {
        blocked: true,
        reasons,
        timezone,
        weekday,
        holidayTitle: holiday.title,
      };
    }

    if (snapshot.options.respectBookingRules) {
      reasons.push(
        ...AvailabilityPolicy.evaluateBookingRules(
          snapshot.date,
          timezone,
          rules,
          snapshot.options.referenceNow ?? new Date(),
        ),
      );
    }

    return {
      blocked: reasons.length > 0,
      reasons,
      timezone,
      weekday,
    };
  }

  static findHoliday(snapshot: AvailabilityContextSnapshot) {
    const resourceBranchId = snapshot.resource?.branch_id ?? null;
    return snapshot.holidays.find((holiday) => {
      if (holiday.holiday_date !== snapshot.date) return false;
      if (!holiday.branch_id) return true;
      return holiday.branch_id === resourceBranchId;
    });
  }

  static evaluateBookingRules(
    date: string,
    timezone: string,
    rules: typeof DEFAULT_BOOKING_RULES,
    referenceNow: Date,
  ): AvailabilityUnavailabilityReason[] {
    const reasons: AvailabilityUnavailabilityReason[] = [];
    const today = TimezoneResolver.localDateForInstant(referenceNow, timezone);
    const dayDiff = AvailabilityPolicy.daysBetween(today, date);

    if (dayDiff < 0 || dayDiff > rules.max_booking_window_days) {
      reasons.push("outside_booking_window");
      return reasons;
    }

    if (dayDiff === 0 && rules.min_booking_notice_minutes > 0) {
      const nowMinutes = AvailabilityPolicy.minutesSinceMidnight(referenceNow, timezone);
      const cutoff = 24 * 60 - rules.min_booking_notice_minutes;
      if (nowMinutes >= cutoff) {
        reasons.push("inside_minimum_notice");
      }
    }

    return reasons;
  }

  static daysBetween(fromDate: string, toDate: string): number {
    const from = Date.parse(`${fromDate}T00:00:00Z`);
    const to = Date.parse(`${toDate}T00:00:00Z`);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  static minutesSinceMidnight(instant: Date, timezone: string): number {
    const time = TimezoneResolver.localTimeForInstant(instant, timezone);
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }
}
