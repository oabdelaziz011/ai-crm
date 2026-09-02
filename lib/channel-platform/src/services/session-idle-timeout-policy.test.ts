import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  idleEndThresholdMs,
  idleWarningThresholdMs,
  mergeSessionIdleTimeoutMetadata,
  pickLocalizedIdleMessage,
  readSessionIdleTimeoutState,
  resolveSessionIdleMessageLanguage,
  resolveSessionIdleTimeoutPhase,
} from "./session-idle-timeout-policy.js";

describe("session-idle-timeout-policy", () => {
  const activityAt = "2026-08-31T00:00:00.000Z";

  it("computes half-time warning and full end thresholds for 6 minutes", () => {
    assert.equal(idleWarningThresholdMs(6), 3 * 60_000);
    assert.equal(idleEndThresholdMs(6), 6 * 60_000);
  });

  it("returns none when timeout is disabled (0)", () => {
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 0,
        now: new Date("2026-08-31T01:00:00.000Z"),
      }),
      "none",
    );
  });

  it("warns at half timeout and ends at full timeout", () => {
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:02:59.000Z"),
      }),
      "none",
    );
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:03:00.000Z"),
      }),
      "warn",
    );
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:06:00.000Z"),
      }),
      "end",
    );
  });

  it("does not re-warn or re-end for the same activity window", () => {
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:04:00.000Z"),
        state: { warningSentForActivityAt: activityAt },
      }),
      "none",
    );
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: activityAt,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:07:00.000Z"),
        state: { warningSentForActivityAt: activityAt, endedForActivityAt: activityAt },
      }),
      "none",
    );
  });

  it("treats equivalent timestamptz formats as the same activity window", () => {
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: "2026-08-30T22:54:30.002+00:00",
        timeoutMinutes: 6,
        now: new Date("2026-08-30T23:01:00.000Z"),
        state: { warningSentForActivityAt: "2026-08-30T22:54:30.002Z" },
      }),
      "end",
    );
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: "2026-08-30T22:54:30.002+00:00",
        timeoutMinutes: 6,
        now: new Date("2026-08-30T22:58:00.000Z"),
        state: { warningSentForActivityAt: "2026-08-30T22:54:30.002Z" },
      }),
      "none",
    );
  });

  it("resets when last activity changes", () => {
    const nextActivity = "2026-08-31T00:10:00.000Z";
    assert.equal(
      resolveSessionIdleTimeoutPhase({
        lastActivityAt: nextActivity,
        timeoutMinutes: 6,
        now: new Date("2026-08-31T00:13:00.000Z"),
        state: {
          warningSentForActivityAt: activityAt,
          endedForActivityAt: activityAt,
        },
      }),
      "warn",
    );
  });

  it("merges idle timeout metadata without dropping other keys", () => {
    const merged = mergeSessionIdleTimeoutMetadata(
      { foo: 1, sessionIdleTimeout: { warningSentForActivityAt: activityAt } },
      { endedForActivityAt: activityAt, endedAt: "2026-08-31T00:06:00.000Z" },
    );
    assert.equal(merged.foo, 1);
    const state = readSessionIdleTimeoutState(merged);
    assert.equal(state.warningSentForActivityAt, activityAt);
    assert.equal(state.endedForActivityAt, activityAt);
  });

  it("picks bilingual message from conversation language", () => {
    const messages = {
      ar: "الجلسة هتنتهي قريب",
      en: "Session ending soon",
    };
    assert.equal(pickLocalizedIdleMessage(messages, "ar"), "الجلسة هتنتهي قريب");
    assert.equal(pickLocalizedIdleMessage(messages, "en"), "Session ending soon");
    assert.equal(
      resolveSessionIdleMessageLanguage({
        variables: { conversation: { language: "en" } },
      }),
      "en",
    );
    assert.equal(
      resolveSessionIdleMessageLanguage({
        variables: { lastMessage: "عايز أحجز" },
        fallbackLanguage: "en",
      }),
      "ar",
    );
  });
});
