import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateInboundAiGate } from "../services/inbound-ai-gate.js";

describe("evaluateInboundAiGate", () => {
  it("allows when no ownership or conversation signals exist", () => {
    const decision = evaluateInboundAiGate({});
    assert.equal(decision.allowAutomatedReply, true);
    assert.equal(decision.source, "default_allow");
  });

  it("blocks when ownership is human_agent", () => {
    const decision = evaluateInboundAiGate({
      ownership: { ownerType: "human_agent", isPaused: false, assignedUserId: "agent-1" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.reason, "owner_human_agent");
    assert.equal(decision.source, "handoff_ownership");
  });

  it("blocks when ownership is queue", () => {
    const decision = evaluateInboundAiGate({
      ownership: { ownerType: "queue", isPaused: false },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.reason, "owner_queue");
  });

  it("blocks when ownership is paused even if AI owns", () => {
    const decision = evaluateInboundAiGate({
      ownership: { ownerType: "ai_employee", isPaused: true, lifecycleState: "PAUSED" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.reason, "handoff_paused");
  });

  it("allows when ownership is ai_employee and not paused", () => {
    const decision = evaluateInboundAiGate({
      ownership: {
        ownerType: "ai_employee",
        isPaused: false,
        lifecycleState: "AI_HANDLING",
        assignedUserId: null,
      },
    });
    assert.equal(decision.allowAutomatedReply, true);
    assert.equal(decision.reason, "owner_ai_employee");
  });

  it("blocks on conversation assignee fallback", () => {
    const decision = evaluateInboundAiGate({
      conversation: { assignedUserId: "agent-2", state: "waiting_user" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.source, "conversation_assignee");
  });

  it("blocks on transferred_to_human conversation state fallback", () => {
    const decision = evaluateInboundAiGate({
      conversation: { assignedUserId: null, state: "transferred_to_human" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.source, "conversation_state");
  });

  it("prefers ownership AI allow over stale conversation assignee is not possible when ownership has assignee", () => {
    const decision = evaluateInboundAiGate({
      ownership: {
        ownerType: "ai_employee",
        isPaused: false,
        assignedUserId: "stale-agent",
      },
      conversation: { assignedUserId: "stale-agent", state: "waiting_user" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.equal(decision.reason, "handoff_assigned_user");
  });
});
