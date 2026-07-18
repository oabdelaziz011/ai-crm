import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STATE_TRANSITION_DEFINITIONS,
  TERMINAL_CONVERSATION_STATES,
  canTransition,
  findTransition,
  findTransitionsToTarget,
  isTerminalState,
  pickTransitionToTarget,
  resolveTransition,
} from "./index.js";

describe("Conversation State Machine", () => {
  it("defines every architecture transition exactly once per from/trigger pair", () => {
    const keys = new Set<string>();
    for (const definition of STATE_TRANSITION_DEFINITIONS) {
      const key = `${definition.from}:${definition.trigger}`;
      assert.equal(keys.has(key), false, `Duplicate transition definition for ${key}`);
      keys.add(key);
    }
    assert.equal(keys.size, STATE_TRANSITION_DEFINITIONS.length);
  });

  it("allows idle to greeting on first inbound message", () => {
    const transition = findTransition("idle", "inbound_first_message");
    assert.ok(transition);
    assert.equal(transition.to, "greeting");
    assert.equal(transition.auditEvent, "conversation_started");
  });

  it("rejects invalid transitions", () => {
    assert.equal(canTransition("idle", "archive"), false);
    assert.equal(canTransition("closed", "inbound_first_message"), false);
    assert.throws(() => resolveTransition("closed", "archive"));
  });

  it("marks closed as terminal", () => {
    assert.equal(isTerminalState("closed"), true);
    assert.equal(TERMINAL_CONVERSATION_STATES.includes("closed"), true);
    assert.equal(findTransitionsToTarget("closed", "greeting").length, 0);
  });

  it("supports human handoff and return to AI", () => {
    assert.ok(canTransition("waiting_user", "handoff"));
    assert.ok(canTransition("transferred_to_human", "agent_release_to_ai"));
    const release = findTransition("transferred_to_human", "agent_release_to_ai");
    assert.equal(release?.to, "greeting");
    assert.equal(release?.auditEvent, "returned_to_ai");
  });

  it("supports completion and archive paths", () => {
    assert.ok(canTransition("waiting_api", "tool_done_terminal"));
    assert.ok(canTransition("completed", "archive"));
    const closePath = pickTransitionToTarget("completed", "closed");
    assert.ok(closePath);
    assert.equal(closePath.trigger, "archive");
  });

  it("supports cancellation via timeout and user cancel", () => {
    assert.ok(canTransition("waiting_user", "user_cancel"));
    assert.ok(canTransition("waiting_user", "timeout"));
    assert.ok(canTransition("waiting_api", "tool_failed_policy"));
  });

  it("recovers collecting information after user reply", () => {
    const transition = findTransition("waiting_user", "user_reply");
    assert.equal(transition?.to, "collecting_information");
  });

  it("picks preferred trigger when completing from waiting_api", () => {
    const picked = pickTransitionToTarget("waiting_api", "completed", ["tool_done_terminal"]);
    assert.equal(picked?.trigger, "tool_done_terminal");
  });
});
