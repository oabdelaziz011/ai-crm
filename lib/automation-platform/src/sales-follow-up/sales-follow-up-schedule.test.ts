import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SALES_FOLLOW_UP_SETTINGS } from "./sales-follow-up.js";
import {
  computeSalesFollowUpDueAt,
  minutesFromDuration,
  salesFollowUpScheduleSteps,
  settingsFromScheduleSteps,
} from "./sales-follow-up-schedule.js";

describe("sales follow-up schedule", () => {
  it("expands default settings into 24h / 3d / 7d absolute steps", () => {
    const steps = salesFollowUpScheduleSteps(DEFAULT_SALES_FOLLOW_UP_SETTINGS);
    assert.equal(steps.length, 3);
    assert.equal(minutesFromDuration(steps[0]!.amount, steps[0]!.unit), 24 * 60);
    assert.equal(minutesFromDuration(steps[1]!.amount, steps[1]!.unit), 3 * 24 * 60);
    assert.equal(minutesFromDuration(steps[2]!.amount, steps[2]!.unit), 7 * 24 * 60);
  });

  it("computes absolute due times from the same anchor", () => {
    const anchor = new Date("2026-10-17T10:00:00.000Z");
    const due1 = computeSalesFollowUpDueAt(anchor, 1, DEFAULT_SALES_FOLLOW_UP_SETTINGS);
    const due2 = computeSalesFollowUpDueAt(anchor, 2, DEFAULT_SALES_FOLLOW_UP_SETTINGS);
    const due3 = computeSalesFollowUpDueAt(anchor, 3, DEFAULT_SALES_FOLLOW_UP_SETTINGS);
    assert.equal(due1.toISOString(), "2026-10-18T10:00:00.000Z");
    assert.equal(due2.toISOString(), "2026-10-20T10:00:00.000Z");
    assert.equal(due3.toISOString(), "2026-10-24T10:00:00.000Z");
  });

  it("round-trips UI steps into settings fields", () => {
    const settings = settingsFromScheduleSteps(
      { enabled: true, channels: ["whatsapp"], approvalMode: "automatic" },
      [
        { attemptNumber: 1, amount: 24, unit: "hours", enabled: true },
        { attemptNumber: 2, amount: 3, unit: "days", enabled: true },
        { attemptNumber: 3, amount: 7, unit: "days", enabled: false },
      ],
    );
    assert.equal(settings.maxAttempts, 2);
    assert.equal(settings.firstDelayMinutes, 24 * 60);
    assert.deepEqual(settings.subsequentIntervalMinutes, [3 * 24 * 60]);
  });
});
