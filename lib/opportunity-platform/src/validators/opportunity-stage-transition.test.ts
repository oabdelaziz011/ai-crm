import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertOpportunityStageTransition,
  isOpportunityStageTransitionAllowed,
} from "./opportunity-stage-transition.js";
import { OpportunityValidationError } from "../errors.js";

describe("opportunity stage transitions", () => {
  it("allows discovery → proposal and forbids won → discovery", () => {
    assert.equal(isOpportunityStageTransitionAllowed("discovery", "proposal"), true);
    assert.equal(isOpportunityStageTransitionAllowed("won", "discovery"), false);
    assert.throws(
      () => assertOpportunityStageTransition("lost", "negotiation"),
      OpportunityValidationError,
    );
  });

  it("treats same-stage as allowed (idempotent)", () => {
    assert.equal(isOpportunityStageTransitionAllowed("proposal", "proposal"), true);
  });
});
