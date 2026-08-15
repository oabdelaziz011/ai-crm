import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimezoneResolver } from "./timezone-resolver.js";

describe("TimezoneResolver.resolveEffectiveTimezone", () => {
  it("prefers company booking-rules timezone when resource/branch are bare UTC", () => {
    assert.equal(
      TimezoneResolver.resolveEffectiveTimezone("UTC", "UTC", "Africa/Cairo"),
      "Africa/Cairo",
    );
  });

  it("keeps an explicitly configured non-UTC resource timezone", () => {
    assert.equal(
      TimezoneResolver.resolveEffectiveTimezone("Asia/Riyadh", "UTC", "Africa/Cairo"),
      "Asia/Riyadh",
    );
  });

  it("allows explicit UTC when booking rules are also UTC", () => {
    assert.equal(
      TimezoneResolver.resolveEffectiveTimezone("UTC", null, "UTC"),
      "UTC",
    );
  });

  it("falls back to UTC when nothing is configured", () => {
    assert.equal(
      TimezoneResolver.resolveEffectiveTimezone(null, null, null),
      "UTC",
    );
  });
});
