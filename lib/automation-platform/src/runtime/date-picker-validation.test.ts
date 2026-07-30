import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSelectedDate,
  validateSelectedDate,
} from "./date-picker-validation.js";

describe("date picker validation", () => {
  const constraints = {
    timezone: "UTC",
    maxBookingWindowDays: 30,
    closedWeekdays: [0, 6],
    entries: [
      {
        date: "2026-08-01",
        reason: "holiday" as const,
        messageKey: "scheduling.datePicker.reasons.holiday",
        messageParams: { title: "Holiday" },
        warningOnly: false,
      },
    ],
    disabledDates: ["2026-08-01"],
    warningDates: [],
  };

  it("normalizes ISO and parseable dates", () => {
    assert.equal(normalizeSelectedDate("2026-08-02"), "2026-08-02");
    assert.equal(normalizeSelectedDate("2026-08-02T00:00:00.000Z"), "2026-08-02");
    assert.equal(normalizeSelectedDate("invalid"), null);
  });

  it("blocks disabled holiday dates", () => {
    assert.deepEqual(validateSelectedDate("2026-08-01", constraints), {
      ok: false,
      reasonKey: "scheduling.datePicker.reasons.holiday",
      reasonParams: { title: "Holiday" },
    });
    assert.deepEqual(validateSelectedDate("2026-08-02", constraints), { ok: true });
  });
});
