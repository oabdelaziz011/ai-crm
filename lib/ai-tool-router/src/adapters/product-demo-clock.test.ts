import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productDemoClockInCairo } from "./product-demo-tool-bridge.js";

describe("product demo Cairo clock", () => {
  it("labels a 15:00 Cairo slot as 15:00, not the UTC hour", () => {
    const clock = productDemoClockInCairo("2026-10-23T12:00:00.000Z");
    assert.equal(clock.date, "2026-10-23");
    assert.equal(clock.slotStart, "15:00");
  });
});
