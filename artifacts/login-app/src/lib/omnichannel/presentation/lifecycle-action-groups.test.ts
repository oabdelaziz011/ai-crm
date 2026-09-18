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

  it("hides the AI generator once a human owns the conversation", () => {
    const assigned = resolveLifecycleActionGroups({
      lifecycleState: "ASSIGNED",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.equal(assigned.primary.includes("open_ai"), false);
    assert.ok(assigned.primary.includes("reply"));
    assert.ok(assigned.primary.includes("transfer") || assigned.primary.includes("assign"));
    assert.ok(assigned.primary.includes("return_to_ai"));

    const aiOwned = resolveLifecycleActionGroups({
      lifecycleState: "AI_HANDLING",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.equal(aiOwned.primary.includes("open_ai"), true);
  });

  it("shows reopen for closed states", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "CLOSED",
      escalated: false,
      isClosed: true,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("reopen"));
    assert.equal(groups.primary.includes("return_to_ai"), false);
  });

  it("shows return_to_ai after reopen while the conversation is still human-owned", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "REOPENED",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("return_to_ai"));
    assert.equal(groups.primary.includes("reopen"), false);
    assert.equal(groups.primary.includes("open_ai"), false);
  });

  it("shows assigned toolbar actions after a claimed conversation is reopened", () => {
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "ASSIGNED",
      escalated: false,
      isClosed: false,
      canPerform: allowAll,
    });
    assert.ok(groups.primary.includes("reply"));
    assert.ok(groups.primary.includes("close"));
    assert.ok(groups.primary.includes("return_to_ai"));
    assert.ok(groups.primary.includes("transfer") || groups.primary.includes("assign"));
    assert.equal(groups.primary.includes("reopen"), false);
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
