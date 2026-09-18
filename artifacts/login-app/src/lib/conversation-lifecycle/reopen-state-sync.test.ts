import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord, ServiceContext } from "@workspace/ai-conversation";
import type { createConversationServices } from "@workspace/ai-conversation";
import { evaluateInboundAiGate } from "@workspace/human-handoff-platform";
import { executeBackendLifecycleHint } from "./adapters/backend-action-executor.js";
import { mapLifecycleActionToBackendHint } from "./adapters/backend-state-adapter.js";
import { executeLifecycleTransition } from "./integration/lifecycle-transition-executor.js";
import { conversationAggregator } from "../omnichannel/aggregators/conversation-aggregator.js";
import { applyConversationQueue } from "../omnichannel/services/conversation-queues.js";
import { resolveLifecycleActionGroups } from "../omnichannel/presentation/lifecycle-action-groups.js";

type ConversationServices = ReturnType<typeof createConversationServices>;

function record(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "company-1",
    conversation_number: "CNV-1",
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "closed",
    external_thread_id: null,
    customer_id: "cust-1",
    assigned_user_id: "agent-1",
    metadata: {
      lifecycle: {
        state: "CLOSED",
        owner: { kind: "user", id: "agent-1", label: "Human Handoff Test Agent" },
      },
    },
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: "2026-09-18T03:00:00.000Z",
    last_message_preview: "hello",
    last_participant_type: "employee",
    search_text: "hello",
    started_at: "2026-09-12T03:00:00.000Z",
    ended_at: "2026-09-18T03:00:00.000Z",
    created_at: "2026-09-12T03:00:00.000Z",
    updated_at: "2026-09-18T03:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...partial,
  };
}

function serviceContext(): ServiceContext {
  return {
    userId: "agent-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

function createFakeServices() {
  const calls = {
    updateState: [] as Array<{ conversationId: string; state: string }>,
    assign: [] as Array<{ conversationId: string; assignedUserId: string }>,
    release: [] as unknown[],
    close: [] as unknown[],
    updateMetadata: [] as unknown[],
  };
  const services = {
    conversations: {
      updateState: async (_ctx: ServiceContext, input: { conversationId: string; state: string }) => {
        calls.updateState.push(input);
        return record({ id: input.conversationId, state: input.state as ConversationRecord["state"] });
      },
      assignConversation: async (_ctx: ServiceContext, input: { conversationId: string; assignedUserId: string }) => {
        calls.assign.push(input);
        return record({ id: input.conversationId, assigned_user_id: input.assignedUserId });
      },
      releaseConversation: async () => {
        calls.release.push({});
        return record({ id: "conv-1", assigned_user_id: null });
      },
      closeConversation: async () => {
        calls.close.push({});
        return record({ id: "conv-1", state: "closed" });
      },
      updateMetadata: async (_ctx: ServiceContext, input: { conversationId: string; metadata: Record<string, unknown> }) => {
        calls.updateMetadata.push(input);
        return record({ id: input.conversationId, metadata: input.metadata });
      },
    },
  } as unknown as ConversationServices;
  return { services, calls };
}

describe("Reopen state synchronization", () => {
  it("1. CLOSED human-owned reopen sets conversations.state to waiting_user", async () => {
    const closed = record({ id: "conv-1" });
    const reopened = executeLifecycleTransition(
      { record: closed },
      "reopen",
      { actorUserId: "agent-1", actorLabel: "Human Handoff Test Agent" },
    );
    assert.equal(reopened.success, true);
    assert.equal(reopened.backendHint?.kind, "update_metadata");

    const { services, calls } = createFakeServices();
    await executeBackendLifecycleHint(services, serviceContext(), {
      conversationId: closed.id,
      action: "reopen",
      hint: reopened.backendHint ?? mapLifecycleActionToBackendHint("reopen", {
        conversationId: closed.id,
        backendState: closed.state,
        assignedUserId: closed.assigned_user_id,
        aiAssistantId: closed.ai_assistant_id,
        metadata: reopened.metadata ?? closed.metadata,
      }),
      assignedUserId: closed.assigned_user_id,
      metadata: reopened.metadata,
    });

    assert.deepEqual(
      calls.updateState,
      [{ conversationId: "conv-1", state: "waiting_user" }],
    );
    assert.equal(calls.release.length, 0);
    assert.equal(calls.close.length, 0);
  });

  it("2. assigned_user_id remains unchanged after Reopen", async () => {
    const closed = record({ id: "conv-1", assigned_user_id: "agent-1" });
    const reopened = executeLifecycleTransition(
      { record: closed },
      "reopen",
      { actorUserId: "agent-1", actorLabel: "Human Handoff Test Agent" },
    );
    const { services, calls } = createFakeServices();
    await executeBackendLifecycleHint(services, serviceContext(), {
      conversationId: closed.id,
      action: "reopen",
      hint: reopened.backendHint ?? null,
      assignedUserId: closed.assigned_user_id,
      metadata: reopened.metadata,
    });
    assert.equal(calls.assign.length, 0);
    assert.equal(calls.release.length, 0);
    assert.equal(closed.assigned_user_id, "agent-1");
    assert.equal(reopened.assignedUserId ?? closed.assigned_user_id, "agent-1");
  });

  it("3. handoff owner remains human_agent after Reopen", () => {
    const decision = evaluateInboundAiGate({
      ownership: {
        ownerType: "human_agent",
        isPaused: false,
        lifecycleState: "CLOSED",
        assignedUserId: "agent-1",
      },
      conversation: { assignedUserId: "agent-1", state: "waiting_user" },
    });
    assert.equal(decision.allowAutomatedReply, false);
    assert.match(decision.reason, /human_agent/);
  });

  it("4. AI remains blocked after Reopen", () => {
    const decision = evaluateInboundAiGate({
      ownership: {
        ownerType: "human_agent",
        isPaused: false,
        lifecycleState: "ASSIGNED",
        assignedUserId: "agent-1",
      },
      conversation: { assignedUserId: "agent-1", state: "waiting_user" },
    });
    assert.equal(decision.allowAutomatedReply, false);
  });

  it("5-6. reopened assigned conversation leaves Closed and appears in Mine", () => {
    const closed = record({ id: "conv-1" });
    const reopened = executeLifecycleTransition(
      { record: closed },
      "reopen",
      { actorUserId: "agent-1", actorLabel: "Human Handoff Test Agent" },
    );
    assert.equal(reopened.success, true);
    const unified = conversationAggregator.aggregateList({
      conversations: [
        {
          ...closed,
          state: "waiting_user",
          ended_at: null,
          metadata: reopened.metadata ?? closed.metadata,
        },
      ],
      customersById: new Map(),
      agentsById: new Map([["agent-1", { id: "agent-1", name: "Human Handoff Test Agent" }]]),
    });
    assert.equal(applyConversationQueue(unified, "closed", "agent-1").length, 0);
    assert.equal(applyConversationQueue(unified, "mine", "agent-1").length, 1);
    const groups = resolveLifecycleActionGroups({
      lifecycleState: "ASSIGNED",
      escalated: false,
      isClosed: false,
      canPerform: () => true,
    });
    assert.ok(groups.primary.includes("reply"));
    assert.ok(groups.primary.includes("close"));
    assert.ok(groups.primary.includes("return_to_ai"));
    assert.ok(groups.primary.includes("transfer"));
  });

  it("7. Return to AI after Reopen still releases ownership to AI", () => {
    const closed = record({ id: "conv-1" });
    const reopened = executeLifecycleTransition(
      { record: closed },
      "reopen",
      { actorUserId: "agent-1", actorLabel: "Human Handoff Test Agent" },
    );
    const returned = executeLifecycleTransition(
      {
        record: {
          ...closed,
          state: "waiting_user",
          assigned_user_id: "agent-1",
          metadata: reopened.metadata!,
        },
      },
      "return_to_ai",
      { actorUserId: "agent-1" },
    );
    assert.equal(returned.success, true);
    assert.equal(returned.validation?.toState, "AI_HANDLING");
    assert.equal(returned.backendHint?.kind, "release");
    assert.equal((returned.metadata?.lifecycle as { owner?: { kind?: string } } | undefined)?.owner?.kind, "ai_employee");
  });

  it("8. Close still closes the conversation row and overlay", async () => {
    const assigned = record({
      id: "conv-1",
      state: "waiting_user",
      ended_at: null,
      metadata: {
        lifecycle: {
          state: "ASSIGNED",
          owner: { kind: "user", id: "agent-1", label: "Human Handoff Test Agent" },
        },
      },
    });
    const closed = executeLifecycleTransition(
      { record: assigned },
      "close",
      { actorUserId: "agent-1" },
    );
    assert.equal(closed.success, true);
    assert.equal(closed.validation?.toState, "CLOSED");
    assert.equal(closed.backendHint?.kind, "close");

    const { services, calls } = createFakeServices();
    await executeBackendLifecycleHint(services, serviceContext(), {
      conversationId: assigned.id,
      action: "close",
      hint: closed.backendHint ?? null,
      assignedUserId: assigned.assigned_user_id,
      metadata: closed.metadata,
    });
    assert.equal(calls.close.length, 1);
    assert.equal(calls.updateState.length, 0);
    assert.equal(calls.release.length, 0);
  });
});
