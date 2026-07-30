import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DAYS_AHEAD,
  InvalidDaysAheadError,
  addDaysIso,
  buildDateScanRange,
  buildEmptyAvailabilityResult,
  filterAvailableDates,
  formatEmptyAvailabilityMessage,
  normalizeDaysAhead,
  suggestNextWindow,
} from "./scan-available-dates.js";
import {
  getNextAvailableSlot,
  scanAvailableDates,
  type AvailabilityScanEnginePort,
} from "./availability-scanner.js";

describe("scan-available-dates", () => {
  it("builds an inclusive range starting from startDate", () => {
    assert.deepEqual(buildDateScanRange("2026-07-29", 7), [
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("normalizes daysAhead with defaults and bounds", () => {
    assert.equal(normalizeDaysAhead(undefined), DEFAULT_DAYS_AHEAD);
    assert.equal(normalizeDaysAhead(14), 14);
    assert.equal(normalizeDaysAhead("30"), 30);
    assert.equal(normalizeDaysAhead(120, 60), 60);
    assert.throws(() => normalizeDaysAhead(0), InvalidDaysAheadError);
    assert.throws(() => normalizeDaysAhead(-1), InvalidDaysAheadError);
    assert.throws(() => normalizeDaysAhead("two weeks"), InvalidDaysAheadError);
  });

  it("filters dates to the configured window", () => {
    assert.deepEqual(
      filterAvailableDates(
        ["2026-07-27", "2026-07-29", "2026-08-04", "2026-08-05"],
        "2026-07-29",
        7,
      ),
      ["2026-07-29", "2026-08-04"],
    );
  });

  it("builds structured empty availability results", () => {
    const empty = buildEmptyAvailabilityResult(7);
    assert.equal(empty.success, false);
    assert.equal(empty.searchedWindow, 7);
    assert.equal(empty.nextSuggestion, 14);
    assert.equal(empty.message, formatEmptyAvailabilityMessage(7));
  });

  it("suggests the next common search window", () => {
    assert.equal(suggestNextWindow(7), 14);
    assert.equal(suggestNextWindow(14), 30);
    assert.equal(suggestNextWindow(90), null);
  });

  it("adds days in UTC-safe ISO form", () => {
    assert.equal(addDaysIso("2026-07-29", 1), "2026-07-30");
  });
});

describe("availability-scanner", () => {
  const engines: AvailabilityScanEnginePort = {
    async resolveAvailability(_companyId, _resourceId, _serviceId, date) {
      return { available: date !== "2026-07-30" };
    },
    async getAvailableSlots(_companyId, _resourceId, _serviceId, date) {
      if (date === "2026-07-31") {
        return {
          available: true,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [{ start: "09:00", end: "09:30" }],
        };
      }
      return {
        available: false,
        timezone: "UTC",
        durationMinutes: 30,
        generatedSlots: [],
      };
    },
  };

  it("scans available dates within the configured window", async () => {
    const result = await scanAvailableDates(engines, {
      companyId: "company-1",
      serviceId: "service-1",
      durationMinutes: 30,
      resources: [{ resourceId: "resource-1", resourceName: "Dr. Ada", capacity: 1 }],
      startDate: "2026-07-29",
      daysAhead: 7,
      timezone: "UTC",
      referenceNow: new Date("2026-07-29T10:00:00.000Z"),
    });

    assert.deepEqual(result.availableDates, ["2026-07-31"]);
    assert.equal(result.searchedWindow, 7);
    assert.equal(result.emptyResult, undefined);
  });

  it("returns structured empty results when nothing is bookable", async () => {
    const blockedEngines: AvailabilityScanEnginePort = {
      async resolveAvailability() {
        return { available: false };
      },
      async getAvailableSlots() {
        return {
          available: false,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [],
        };
      },
    };

    const result = await scanAvailableDates(blockedEngines, {
      companyId: "company-1",
      serviceId: "service-1",
      durationMinutes: 30,
      resources: [{ resourceId: "resource-1", resourceName: "Dr. Ada", capacity: 1 }],
      startDate: "2026-07-29",
      daysAhead: 7,
      timezone: "UTC",
    });

    assert.deepEqual(result.availableDates, []);
    assert.equal(result.emptyResult?.searchedWindow, 7);
    assert.equal(result.emptyResult?.nextSuggestion, 14);
  });

  it("returns the first bookable slot without scanning the full window", async () => {
    let slotChecks = 0;
    const countingEngines: AvailabilityScanEnginePort = {
      async resolveAvailability(_companyId, _resourceId, _serviceId, date) {
        slotChecks += 1;
        return { available: date === "2026-07-30" || date === "2026-07-31" };
      },
      async getAvailableSlots(_companyId, _resourceId, _serviceId, date) {
        slotChecks += 1;
        if (date === "2026-07-30") {
          return {
            available: true,
            timezone: "UTC",
            durationMinutes: 30,
            generatedSlots: [{ start: "10:00", end: "10:30" }],
          };
        }
        return {
          available: true,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [{ start: "09:00", end: "09:30" }],
        };
      },
    };

    const next = await getNextAvailableSlot(countingEngines, {
      companyId: "company-1",
      serviceId: "service-1",
      durationMinutes: 30,
      resources: [{ resourceId: "resource-1", resourceName: "Dr. Ada", capacity: 1 }],
      startDate: "2026-07-29",
      daysAhead: 7,
      timezone: "UTC",
    });

    assert.equal(next?.date, "2026-07-30");
    assert.deepEqual(next?.slot, { start: "10:00", end: "10:30" });
    assert.equal(slotChecks, 3);
  });
});
