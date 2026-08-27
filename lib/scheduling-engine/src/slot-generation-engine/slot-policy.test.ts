import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SlotPolicy } from "./slot-policy.js";

describe("SlotPolicy.applyMinimumNotice", () => {
  it("excludes same-day slots that have already started even when minNotice is 0", () => {
    const now = new Date("2026-08-26T19:10:00.000Z"); // 22:10 Africa/Cairo (UTC+3)
    const filtered = SlotPolicy.applyMinimumNotice(["21:00", "21:45", "22:15", "22:30"], {
      respectBookingRules: true,
      minBookingNoticeMinutes: 0,
      timezone: "Africa/Cairo",
      date: "2026-08-26",
      referenceNow: now,
    });
    assert.deepEqual(filtered, ["22:15", "22:30"]);
  });

  it("honors min notice on top of the past-slot floor", () => {
    const now = new Date("2026-08-26T19:10:00.000Z"); // 22:10 Cairo
    const filtered = SlotPolicy.applyMinimumNotice(["22:15", "23:15", "23:30"], {
      respectBookingRules: true,
      minBookingNoticeMinutes: 60,
      timezone: "Africa/Cairo",
      date: "2026-08-26",
      referenceNow: now,
    });
    assert.deepEqual(filtered, ["23:15", "23:30"]);
  });

  it("does not trim future calendar dates", () => {
    const now = new Date("2026-08-26T19:10:00.000Z");
    const filtered = SlotPolicy.applyMinimumNotice(["07:00", "07:15"], {
      respectBookingRules: true,
      minBookingNoticeMinutes: 60,
      timezone: "Africa/Cairo",
      date: "2026-08-27",
      referenceNow: now,
    });
    assert.deepEqual(filtered, ["07:00", "07:15"]);
  });
});
