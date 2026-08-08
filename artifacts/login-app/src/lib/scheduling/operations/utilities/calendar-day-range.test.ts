import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  getCalendarDayRange,
  getCalendarToday,
} from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { resolveQueueDateRange } from "@/lib/universal-operations/operations-queue-date-range";

describe("getCalendarDayRange", () => {
  it("uses exclusive end for UTC+3 (Asia/Riyadh)", () => {
    expect(getCalendarDayRange("2026-08-05", "Asia/Riyadh")).toEqual({
      startUtc: "2026-08-04T21:00:00.000Z",
      endUtc: "2026-08-05T21:00:00.000Z",
    });
  });

  it("uses exclusive end for UTC", () => {
    expect(getCalendarDayRange("2026-08-05", "UTC")).toEqual({
      startUtc: "2026-08-05T00:00:00.000Z",
      endUtc: "2026-08-06T00:00:00.000Z",
    });
  });

  it("uses exclusive end for America/New_York in August (EDT = UTC-4)", () => {
    expect(getCalendarDayRange("2026-08-05", "America/New_York")).toEqual({
      startUtc: "2026-08-05T04:00:00.000Z",
      endUtc: "2026-08-06T04:00:00.000Z",
    });
  });
});

describe("resolveQueueDateRange presets", () => {
  it("resolves yesterday as previous calendar day in company TZ", () => {
    const today = getCalendarToday("Asia/Riyadh");
    const range = resolveQueueDateRange("yesterday", null, null, "Asia/Riyadh");
    expect(range.datePreset).toBe("yesterday");
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.dateFrom).toBe(addCalendarDays(today, -1));
  });

  it("resolves this_week as 7 inclusive calendar days Mon–Sun", () => {
    const range = resolveQueueDateRange("this_week", null, null, "UTC");
    expect(addCalendarDays(range.dateFrom, 6)).toBe(range.dateTo);
  });

  it("resolves custom range ordered ascending", () => {
    const range = resolveQueueDateRange("custom", "2026-08-10", "2026-08-05", "UTC");
    expect(range).toEqual({
      datePreset: "custom",
      dateFrom: "2026-08-05",
      dateTo: "2026-08-10",
    });
  });
});
