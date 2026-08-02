import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLifecycleActionGroups } from "./lifecycle-action-groups.js";

describe("LifecycleActionGroups (presentation)", () => {
  const allowAll = () => true;
  const denyAll = () => false;

  it("shows take over and assign for AI-owned states", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "AI_HANDLING",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("take_over"));
    assert.ok(groups.primary.includes("assign") || groups.primary.includes("escalate"));
  });

  it("shows reply and transfer for human-owned states", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "ASSIGNED",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("reply"));
    assert.ok(groups.primary.includes("transfer") || groups.primary.includes("assign"));
    assert.ok(groups.primary.includes("return_to_ai"));
  });

  it("shows reopen for closed states", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "CLOSED",
      escalated: false,
      isClosed: true,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("reopen"));
  });

  it("respects canPerform from coordinator", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "ASSIGNED",
      escalated: false,
      isClosed: false,
      canPerform: denyAll,
    });
    assert.equal(groups.primary.length, 0);
  });
});
