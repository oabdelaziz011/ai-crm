import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStageTransitionAllowed } from "./stage-transition-validator.js";

describe("demo_completed lead transitions", () => {
  it("allows demo_scheduled → demo_completed and forbids demo_scheduled → proposal_sent", () => {
    assert.equal(isStageTransitionAllowed("demo_scheduled", "demo_completed"), true);
    assert.equal(isStageTransitionAllowed("demo_scheduled", "proposal_sent"), false);
    assert.equal(isStageTransitionAllowed("demo_completed", "proposal_sent"), true);
  });
});
