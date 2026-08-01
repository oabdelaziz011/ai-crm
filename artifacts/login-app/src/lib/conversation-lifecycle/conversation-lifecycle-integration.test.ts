import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { conversationLifecycleCoordinator } from "./coordinator/conversation-lifecycle-coordinator.js";
import { executeLifecycleTransition } from "./integration/lifecycle-transition-executor.js";
import { getActiveEscalation, getCurrentAssignment, getEscalationHistory } from "./index.js";
import { conversationAggregator } from "../omnichannel/aggregators/conversation-aggregator.js";
import { isConversationEscalated } from "./integration/operational-projection.js";

function record(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "co-1",
    conversation_number: "CNV-1",
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "transferred_to_human",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: "user-1",
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: "employee",
    search_text: "",
    started_at: "2026-08-01T08:00:00.000Z",
    ended_at: null,
    created_at: "2026-08-01T08:00:00.000Z",
    updated_at: "2026-08-01T08:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...partial,
  };
}

describe("Lifecycle Integration", () => {
  it("assigns through transition and persists assignment history in metadata", () => {
    const input = { record: record({ id: "1" }) };
    const result = executeLifecycleTransition(input, "assign", {
      assignment: {
        targetType: "user",
        targetId: "user-2",
        targetLabel: "Agent Two",
        method: "manual",
        assignedByUserId: "mgr-1",
      },
    });
    assert.equal(result.success, true);
    assert.ok(getCurrentAssignment(result.metadata!));
    assert.equal(getCurrentAssignment(result.metadata!)?.targetId, "user-2");
  });

  it("reassigns via transfer action", () => {
    const assigned = executeLifecycleTransition({ record: record({ id: "1" }) }, "assign", {
      assignment: {
        targetType: "user",
        targetId: "user-1",
        targetLabel: "Agent One",
        method: "manual",
        assignedByUserId: "mgr-1",
      },
    });
    const result = executeLifecycleTransition(
      { record: { ...record({ id: "1" }), metadata: assigned.metadata! } },
      "transfer",
      {
        assignment: {
          targetType: "user",
          targetId: "user-3",
          targetLabel: "Agent Three",
          method: "transfer",
          assignedByUserId: "mgr-1",
        },
      },
    );
    assert.equal(result.success, true);
    assert.equal(getCurrentAssignment(result.metadata!)?.targetId, "user-3");
  });

  it("escalates and marks metadata escalated", () => {
    const input = { record: record({ id: "1" }) };
    const result = executeLifecycleTransition(input, "escalate", {
      escalation: {
        level: 1,
        targetLevel: "supervisor",
        targetOwnerKind: "user",
        targetOwnerId: null,
        reason: "VIP",
        priority: "urgent",
        notes: "",
        createdByUserId: "agent-1",
      },
    });
    assert.equal(result.success, true);
    assert.ok(getActiveEscalation(result.metadata!));
    assert.ok(isConversationEscalated({ ...input.record, metadata: result.metadata! }));
  });

  it("returns from escalation", () => {
    const escalated = executeLifecycleTransition({ record: record({ id: "1" }) }, "escalate", {
      escalation: {
        level: 1,
        targetLevel: "manager",
        targetOwnerKind: "user",
        targetOwnerId: null,
        reason: "Help needed",
        priority: "high",
        notes: "",
        createdByUserId: "agent-1",
      },
    });
    const result = executeLifecycleTransition(
      { record: { ...record({ id: "1" }), metadata: escalated.metadata! } },
      "return",
      { actorUserId: "sup-1" },
    );
    assert.equal(result.success, true);
    assert.equal(getActiveEscalation(result.metadata!), null);
  });

  it("returns to AI via lifecycle transition", () => {
    const input = { record: record({ id: "1" }) };
    const result = executeLifecycleTransition(input, "return_to_ai", {
      actorUserId: "user-1",
    });
    assert.equal(result.success, true);
    assert.equal(result.validation?.toState, "AI_HANDLING");
    assert.equal(result.backendHint?.kind, "release");
  });

  it("resolves and reopens", () => {
    const input = { record: record({ id: "1" }) };
    const resolved = executeLifecycleTransition(input, "resolve", { actorUserId: "user-1" });
    assert.equal(resolved.success, true);
    assert.equal(resolved.validation?.toState, "RESOLVED");

    const closed = executeLifecycleTransition(
      { record: { ...input.record, metadata: resolved.metadata! } },
      "close",
      { actorUserId: "user-1" },
    );
    assert.equal(closed.success, true);

    const reopened = executeLifecycleTransition(
      { record: { ...input.record, state: "closed", metadata: closed.metadata! } },
      "reopen",
      { actorUserId: "user-1" },
    );
    assert.equal(reopened.success, true);
    assert.equal(reopened.validation?.toState, "REOPENED");
  });

  it("aggregator exposes lifecycle fields from metadata", () => {
    const assigned = executeLifecycleTransition({ record: record({ id: "1" }) }, "assign", {
      assignment: {
        targetType: "user",
        targetId: "user-2",
        targetLabel: "Agent",
        method: "manual",
        assignedByUserId: "mgr-1",
      },
    });
    const unified = conversationAggregator.aggregateConversation(
      { ...record({ id: "1" }), metadata: assigned.metadata! },
      new Map(),
      new Map([["user-2", { id: "user-2", name: "Agent" }]]),
    );
    assert.equal(unified.lifecycleState, "ASSIGNED");
    assert.equal(unified.ownerLabel, "Agent");
  });

  it("coordinator snapshot includes timeline after assignment", () => {
    const assigned = executeLifecycleTransition({ record: record({ id: "1" }) }, "assign", {
      assignment: {
        targetType: "user",
        targetId: "user-9",
        targetLabel: "Taker",
        method: "manual",
        assignedByUserId: "user-9",
      },
    });
    assert.equal(assigned.success, true);
    const snap = conversationLifecycleCoordinator.snapshot({
      record: { ...record({ id: "1" }), metadata: assigned.metadata ?? {} },
    });
    assert.ok(snap.assignmentHistory.length >= 1);
    assert.ok(snap.timeline.length >= 1);
  });

  it("internal note timeline type is supported", () => {
    const snap = conversationLifecycleCoordinator.snapshot({ record: record({ id: "1" }) });
    assert.ok(Array.isArray(snap.permittedActions));
    assert.ok(snap.permittedActions.includes("internal_note") || snap.allowedActions.includes("internal_note"));
  });

  it("ownership resolved from metadata assignment", () => {
    const result = executeLifecycleTransition({ record: record({ id: "1" }) }, "assign", {
      assignment: {
        targetType: "team",
        targetId: "team-support",
        targetLabel: "Support Team",
        method: "manual",
        assignedByUserId: "mgr-1",
      },
    });
    const snap = conversationLifecycleCoordinator.snapshot({
      record: { ...record({ id: "1" }), metadata: result.metadata! },
    });
    assert.equal(snap.owner.kind, "team");
    assert.equal(snap.owner.label, "Support Team");
  });

  it("escalation history accumulates", () => {
    const first = executeLifecycleTransition({ record: record({ id: "1" }) }, "escalate", {
      escalation: {
        level: 1,
        targetLevel: "team_leader",
        targetOwnerKind: "user",
        targetOwnerId: null,
        reason: "First",
        priority: "high",
        notes: "",
        createdByUserId: "a",
      },
    });
    const history = getEscalationHistory(first.metadata!);
    assert.equal(history.length, 1);
  });
});
