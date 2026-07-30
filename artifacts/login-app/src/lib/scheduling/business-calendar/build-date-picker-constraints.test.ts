import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDatePickerConstraints } from "./build-date-picker-constraints.js";
import { DEFAULT_BOOKING_RULES } from "../types";

describe("buildDatePickerConstraints", () => {
  const rules = {
    ...DEFAULT_BOOKING_RULES,
    timezone: "UTC",
    max_booking_window_days: 7,
  };

  it("merges past dates, holidays, and closed weekdays", () => {
    const snapshot = buildDatePickerConstraints({
      holidays: [{ id: "h1", company_id: "c1", branch_id: null, holiday_date: "2026-08-01", title: "National Day", created_at: "", updated_at: "", created_by: null, updated_by: null, deleted_at: null }],
      bookingRules: rules as never,
      openWeekdays: [1, 2, 3, 4, 5],
      options: {
        disablePastDates: true,
        disableCompanyHolidays: true,
        holidayBehavior: "disable",
        disableClosedWeekdays: true,
      },
      referenceNow: new Date("2026-07-28T10:00:00.000Z"),
      fromDate: "2026-07-26",
      toDate: "2026-08-03",
    });

    assert.equal(snapshot.disabledDates.includes("2026-07-26"), true);
    assert.equal(snapshot.disabledDates.includes("2026-07-27"), true);
    assert.equal(snapshot.disabledDates.includes("2026-08-01"), true);
    assert.equal(snapshot.disabledDates.includes("2026-07-29"), false);
  });

  it("treats holidays as warning-only when configured", () => {
    const snapshot = buildDatePickerConstraints({
      holidays: [{ id: "h1", company_id: "c1", branch_id: null, holiday_date: "2026-07-30", title: "Company Event", created_at: "", updated_at: "", created_by: null, updated_by: null, deleted_at: null }],
      bookingRules: rules as never,
      openWeekdays: [0, 1, 2, 3, 4, 5, 6],
      options: {
        disablePastDates: false,
        disableCompanyHolidays: true,
        holidayBehavior: "warning",
        disableClosedWeekdays: false,
      },
      referenceNow: new Date("2026-07-28T10:00:00.000Z"),
      fromDate: "2026-07-28",
      toDate: "2026-07-31",
    });

    assert.equal(snapshot.disabledDates.includes("2026-07-30"), false);
    assert.equal(snapshot.warningDates.includes("2026-07-30"), true);
  });
});
