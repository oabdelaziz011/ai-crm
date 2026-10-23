import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDemoLedLifecycle } from "./demo-led-lead.js";

describe("isDemoLedLifecycle", () => {
  it("recognizes demo_scheduled and demo_completed only", () => {
    assert.equal(isDemoLedLifecycle("demo_scheduled"), true);
    assert.equal(isDemoLedLifecycle("demo_completed"), true);
    assert.equal(isDemoLedLifecycle("qualified"), false);
    assert.equal(isDemoLedLifecycle("proposal_sent"), false);
  });
});
