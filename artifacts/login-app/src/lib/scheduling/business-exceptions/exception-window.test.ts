import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingOverlapsExceptionWindow,
  resolveExceptionWindow,
} from "./exception-window.ts";
import { BusinessApologyExceptionError } from "./types.ts";

describe("resolveExceptionWindow", () => {
  it("builds a full-day window in company timezone", () => {
    const window = resolveExceptionWindow({
      exceptionDate: "2026-08-05",
      scope: "full_day",
      timezone: "Africa/Cairo",
    });
    assert.equal(window.startTime, null);
    assert.equal(window.endTime, null);
    assert.equal(window.windowStartAt, "2026-08-04T21:00:00.000Z");
    assert.equal(window.windowEndAt, "2026-08-05T21:00:00.000Z");
  });

  it("builds a specific-hours window", () => {
    const window = resolveExceptionWindow({
      exceptionDate: "2026-08-05",
      scope: "hours",
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Africa/Cairo",
    });
    assert.equal(window.startTime, "09:00");
    assert.equal(window.endTime, "12:00");
    assert.equal(window.windowStartAt, "2026-08-05T06:00:00.000Z");
    assert.equal(window.windowEndAt, "2026-08-05T09:00:00.000Z");
  });

  it("rejects invalid time ranges", () => {
    assert.throws(
      () =>
        resolveExceptionWindow({
          exceptionDate: "2026-08-05",
          scope: "hours",
          startTime: "12:00",
          endTime: "09:00",
          timezone: "UTC",
        }),
      (error: unknown) =>
        error instanceof BusinessApologyExceptionError && error.code === "invalid_time_range",
    );
  });

  it("rejects invalid dates", () => {
    assert.throws(
      () =>
        resolveExceptionWindow({
          exceptionDate: "05-08-2026",
          scope: "full_day",
          timezone: "UTC",
        }),
      (error: unknown) =>
        error instanceof BusinessApologyExceptionError && error.code === "invalid_input",
    );
  });
});

describe("bookingOverlapsExceptionWindow", () => {
  it("detects overlapping appointments", () => {
    assert.equal(
      bookingOverlapsExceptionWindow(
        "2026-08-05T07:00:00.000Z",
        "2026-08-05T07:30:00.000Z",
        "2026-08-05T06:00:00.000Z",
        "2026-08-05T09:00:00.000Z",
      ),
      true,
    );
  });

  it("excludes appointments outside the interval", () => {
    assert.equal(
      bookingOverlapsExceptionWindow(
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T10:30:00.000Z",
        "2026-08-05T06:00:00.000Z",
        "2026-08-05T09:00:00.000Z",
      ),
      false,
    );
  });

  it("excludes bookings that start exactly at window end", () => {
    assert.equal(
      bookingOverlapsExceptionWindow(
        "2026-08-05T09:00:00.000Z",
        "2026-08-05T09:30:00.000Z",
        "2026-08-05T06:00:00.000Z",
        "2026-08-05T09:00:00.000Z",
      ),
      false,
    );
  });
});
