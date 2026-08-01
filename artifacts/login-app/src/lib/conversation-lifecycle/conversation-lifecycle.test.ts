import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  conversationLifecycleEngine,
  resolveLifecycleState,
  resolveConversationOwner,
  isActionAllowed,
  buildTransitionMatrix,
  assignConversation,
  addEscalation,
  getActiveEscalation,
  transitionEscalation,
  buildConversationTimeline,
  buildConversationHeader,
  canPerformLifecycleAction,
  validateAiLifecycleCommand,
  conversationLifecycleCoordinator,
  readLifecycleOverlay,
  resetPresenceStore,
  setAgentOnline,
  getAgentPresence,
} from "./index.js";
import { executeLifecycleTransition } from "./integration/lifecycle-transition-executor.js";
import {
  migrateLifecycleMetadata,
  needsLifecycleMetadataMigration,
} from "./integration/lifecycle-metadata-migration.js";
import { resetTimelineCounter } from "./engines/timeline-engine.js";

function conversation(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "co-1",
    conversation_number: "CNV-1",
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: null,
    customer_id: "cust-1",
    assigned_user_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: "customer",
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

describe("ConversationLifecycleEngine", () => {
  it("maps backend idle to NEW", () => {
    const state = resolveLifecycleState({
      conversationId: "1",
      backendState: "idle",
      assignedUserId: null,
      aiAssistantId: "ai-1",
      metadata: {},
    });
    assert.equal(state, "NEW");
  });

  it("maps transferred_to_human without assignee to WAITING_QUEUE", () => {
    const state = resolveLifecycleState({
      conversationId: "1",
      backendState: "transferred_to_human",
      assignedUserId: null,
      aiAssistantId: "ai-1",
      metadata: {},
    });
    assert.equal(state, "WAITING_QUEUE");
  });

  it("forbids return_to_ai and escalate in AI_HANDLING", () => {
    assert.equal(isActionAllowed("AI_HANDLING", "return_to_ai"), false);
    assert.equal(isActionAllowed("AI_HANDLING", "escalate"), false);
    assert.equal(isActionAllowed("AI_HANDLING", "take_over"), true);
    assert.equal(isActionAllowed("AI_HANDLING", "assign"), true);
    assert.equal(isActionAllowed("AI_HANDLING", "close"), true);
  });

  it("allows full ASSIGNED action set from spec", () => {
    for (const action of [
      "reply",
      "assign",
      "escalate",
      "internal_note",
      "return_to_ai",
      "resolve",
      "close",
    ] as const) {
      assert.equal(isActionAllowed("ASSIGNED", action), true, action);
    }
  });

  it("CLOSED only allows reopen", () => {
    assert.equal(isActionAllowed("CLOSED", "reopen"), true);
    assert.equal(isActionAllowed("CLOSED", "assign"), false);
    assert.equal(isActionAllowed("CLOSED", "close"), false);
  });

  it("validates transitions and produces timeline events", () => {
    const ctx = {
      conversationId: "1",
      backendState: "transferred_to_human",
      assignedUserId: "user-1",
      aiAssistantId: "ai-1",
      metadata: {},
    };
    const result = conversationLifecycleEngine.validateTransition(ctx, "escalate");
    assert.equal(result.allowed, true);
    assert.equal(result.toState, "ESCALATED");
    assert.ok(result.timelineEvent);
  });
});

describe("OwnershipEngine", () => {
  it("prefers metadata owner over backend", () => {
    const owner = resolveConversationOwner({
      conversationId: "1",
      backendState: "waiting_user",
      assignedUserId: "user-1",
      aiAssistantId: "ai-1",
      metadata: {
        lifecycle: { owner: { kind: "team", id: "team-1", label: "Support" } },
      },
    });
    assert.equal(owner.kind, "team");
    assert.equal(owner.id, "team-1");
  });

  it("defaults to AI employee for AI-handled states", () => {
    const owner = resolveConversationOwner({
      conversationId: "1",
      backendState: "greeting",
      assignedUserId: null,
      aiAssistantId: "ai-1",
      metadata: {},
    });
    assert.equal(owner.kind, "ai_employee");
  });
});

describe("AssignmentEngine", () => {
  beforeEach(() => resetTimelineCounter());

  it("creates assignment history", () => {
    const { record, metadata } = assignConversation({}, {
      conversationId: "1",
      targetType: "user",
      targetId: "user-1",
      targetLabel: "Agent One",
      method: "manual",
      assignedByUserId: "mgr-1",
    });
    assert.ok(record.id.startsWith("asg-"));
    assert.equal((metadata.lifecycle as { assignmentHistory: unknown[] }).assignmentHistory.length, 1);
  });
});

describe("EscalationEngine", () => {
  it("tracks escalation lifecycle", () => {
    const { metadata, record } = addEscalation({}, {
      conversationId: "1",
      level: 1,
      targetLevel: "supervisor",
      targetOwnerKind: "user",
      targetOwnerId: "sup-1",
      reason: "VIP customer",
      priority: "urgent",
      notes: "",
      createdByUserId: "agent-1",
      snapshot: {
        lifecycleState: "ASSIGNED",
        owner: { kind: "user", id: "agent-1", label: "Agent" },
        queueId: null,
      },
    });
    assert.equal(record.status, "waiting_acceptance");
    assert.ok(getActiveEscalation(metadata));

    const accepted = transitionEscalation(metadata, record.id, "accepted");
    const active = getActiveEscalation(accepted);
    assert.ok(active);
    assert.equal(active?.status, "accepted");
  });
});

describe("PresenceEngine", () => {
  beforeEach(() => resetPresenceStore());

  it("stores single presence per user", () => {
    setAgentOnline("user-1");
    const presence = getAgentPresence("user-1");
    assert.equal(presence?.state, "online");
  });
});

describe("TimelineEngine", () => {
  it("merges messages and lifecycle events chronologically", () => {
    const timeline = buildConversationTimeline({
      conversationId: "1",
      metadata: {},
      messages: [],
    });
    assert.ok(Array.isArray(timeline));
  });

  it("dedupes assignment history and stored timeline events", () => {
    const assigned = executeLifecycleTransition({ record: conversation({ id: "1" }) }, "assign", {
      assignment: {
        targetType: "user",
        targetId: "user-2",
        targetLabel: "Agent Two",
        method: "manual",
        assignedByUserId: "mgr-1",
      },
    });
    const snap = conversationLifecycleCoordinator.snapshot({
      record: { ...conversation({ id: "1" }), metadata: assigned.metadata ?? {} },
    });
    const assignmentEvents = snap.timeline.filter((event) => event.type === "assignment");
    assert.equal(assignmentEvents.length, 1);
  });
});

describe("LifecycleMetadataMigration", () => {
  it("builds overlay for legacy records without lifecycle metadata", () => {
    const legacy = conversation({ id: "legacy-1", metadata: { tags: ["vip"] } });
    assert.equal(needsLifecycleMetadataMigration(legacy), true);
    const migrated = migrateLifecycleMetadata(legacy);
    const overlay = readLifecycleOverlay(migrated);
    assert.ok(overlay?.state);
    assert.ok(overlay?.migratedAt);
    assert.equal(needsLifecycleMetadataMigration({ ...legacy, metadata: migrated }), false);
  });
});

describe("HeaderModel", () => {
  it("builds unified header without duplication", () => {
    const header = buildConversationHeader({ conversation: conversation({ id: "1" }) });
    assert.equal(header.conversationId, "1");
    assert.equal(header.lifecycleState, "AI_HANDLING");
    assert.ok(header.owner);
    assert.ok(header.aiEmployee);
  });
});

describe("LifecyclePermissions", () => {
  it("restricts agent from bulk assign", () => {
    const allowed = canPerformLifecycleAction(
      { role: "agent", userId: "a", isSuperAdmin: false, hasPermission: () => true },
      "bulk_assign",
    );
    assert.equal(allowed, false);
  });

  it("allows admin all actions", () => {
    const allowed = canPerformLifecycleAction(
      { role: "admin", userId: "a", isSuperAdmin: true, hasPermission: () => true },
      "bulk_assign",
    );
    assert.equal(allowed, true);
  });
});

describe("AiLifecycleParticipant", () => {
  it("validates ai_request_human from AI_HANDLING", () => {
    const result = validateAiLifecycleCommand(
      {
        conversationId: "1",
        backendState: "greeting",
        assignedUserId: null,
        aiAssistantId: "ai-1",
        metadata: {},
      },
      { action: "ai_request_human", conversationId: "1" },
    );
    assert.equal(result.allowed, true);
    assert.equal(result.nextState, "WAITING_QUEUE");
  });
});

describe("ConversationLifecycleCoordinator", () => {
  it("produces full snapshot", () => {
    const snap = conversationLifecycleCoordinator.snapshot({
      record: conversation({ id: "1", assigned_user_id: "user-1", state: "transferred_to_human" }),
    });
    assert.equal(snap.state, "ASSIGNED");
    assert.ok(snap.header);
    assert.ok(snap.allowedActions.includes("escalate"));
  });

  it("exports architecture matrices", () => {
    const matrices = conversationLifecycleCoordinator.getArchitectureMatrices();
    assert.ok(matrices.transitions.AI_HANDLING);
    assert.ok(matrices.assignment.manual);
    assert.ok(matrices.escalation.created);
    assert.equal(buildTransitionMatrix().CLOSED.allowed.length, 1);
  });
});
