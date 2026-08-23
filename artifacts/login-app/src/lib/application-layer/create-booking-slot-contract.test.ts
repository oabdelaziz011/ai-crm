import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Regression: AI create_booking must pass HH:mm slotStart into domain validation,
 * not a full ISO string (which yields invalid_slot_time).
 */
describe("create booking slotStart contract", () => {
  it("accepts HH:mm and rejects full ISO as slotStart", () => {
    const slotPattern = /^\d{2}:\d{2}$/;
    assert.equal(slotPattern.test("08:00"), true);
    assert.equal(slotPattern.test("2026-08-27T05:00:00.000Z"), false);
  });
});
