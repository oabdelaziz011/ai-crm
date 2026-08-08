import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertStageTransition, selectAssignmentCandidate } from "../validators/stage-transition-validator.js";
import { LeadStageTransitionError } from "../errors.js";

describe("stage transition validator", () => {
  it("allows valid forward transitions", () => {
    assert.doesNotThrow(() => assertStageTransition("new", "qualified"));
    assert.doesNotThrow(() => assertStageTransition("qualified", "contacted"));
  });

  it("rejects backward transitions when allowBackward is false", () => {
    assert.throws(
      () => assertStageTransition("proposal_sent", "contacted", { allowBackward: false }),
      LeadStageTransitionError,
    );
    assert.throws(() => assertStageTransition("new", "won"), LeadStageTransitionError);
  });

  it("allows backward transitions when allowBackward is true", () => {
    assert.doesNotThrow(() =>
      assertStageTransition("proposal_sent", "contacted", { allowBackward: true }),
    );
    assert.doesNotThrow(() =>
      assertStageTransition("proposal_sent", "new", { allowBackward: true }),
    );
    assert.doesNotThrow(() =>
      assertStageTransition("proposal_sent", "qualified", { allowBackward: true }),
    );
  });
});

describe("assignment engine", () => {
  const candidates = [
    { userId: "a", activeLeadCount: 3, lastAssignedAt: "2026-01-01T00:00:00.000Z" },
    { userId: "b", activeLeadCount: 1, lastAssignedAt: "2026-01-02T00:00:00.000Z" },
  ];

  it("selects least busy agent", () => {
    assert.equal(selectAssignmentCandidate(candidates, "least_busy", false), "b");
  });

  it("selects round robin agent", () => {
    assert.equal(selectAssignmentCandidate(candidates, "round_robin", false), "a");
  });
});
