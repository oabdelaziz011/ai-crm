import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localDateTimeToInstantIso } from "./booking-time-utils";

describe("localDateTimeToInstantIso", () => {
  it("stores 9:00 AM Africa/Cairo as 06:00 UTC during Egypt UTC+3", () => {
    assert.equal(
      localDateTimeToInstantIso("2026-09-17", "09:00", "Africa/Cairo"),
      "2026-09-17T06:00:00.000Z",
    );
  });

  it("does not treat 9:00 AM as 09:00 UTC", () => {
    assert.notEqual(
      localDateTimeToInstantIso("2026-09-17", "09:00", "Africa/Cairo"),
      "2026-09-17T09:00:00.000Z",
    );
  });
});
