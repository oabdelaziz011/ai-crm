/**
 * ConversationService assign / release — Email Workspace reuses these methods.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_PERMISSIONS } from "../constants.ts";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "user-a",
    companyId: partial.companyId ?? "company-1",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? "company-1",
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "email",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "waiting_user",
    external_thread_id: overrides.external_thread_id ?? null,
    customer_id: overrides.customer_id ?? null,
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? null,
    metadata: overrides.metadata ?? {},
    priority: overrides.priority ?? "normal",
    locked_by: overrides.locked_by ?? null,
    locked_at: overrides.locked_at ?? null,
    unread_count_employee: overrides.unread_count_employee ?? 0,
    unread_count_customer: overrides.unread_count_customer ?? 0,
    last_message_at: overrides.last_message_at ?? null,
    last_message_preview: overrides.last_message_preview ?? null,
    last_participant_type: overrides.last_participant_type ?? null,
    search_text: overrides.search_text ?? "",
    started_at: overrides.started_at ?? new Date().toISOString(),
    ended_at: overrides.ended_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    deleted_at: overrides.deleted_at ?? null,
    deleted_by: overrides.deleted_by ?? null,
  };
}

describe("ConversationService.assignConversation", () => {
  it("requires ai.conversations.takeover", async () => {
    const service = new ConversationService({
      findById: async () => conversation(),
      assign: async () => conversation({ assigned_user_id: "agent-b" }),
    } as never);

    await assert.rejects(
      () =>
        service.assignConversation(ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }), {
          conversationId: "conv-1",
          assignedUserId: "agent-b",
          state: "waiting_user",
        }),
      PermissionDeniedError,
    );
  });

  it("writes assigned_user_id and preserves the provided email state", async () => {
    const writes: unknown[] = [];
    const service = new ConversationService({
      findById: async () => conversation({ state: "waiting_user" }),
      assign: async (input) => {
        writes.push(input);
        return conversation({
          assigned_user_id: input.assignedUserId,
          state: input.state ?? "transferred_to_human",
        });
      },
    } as never);

    const row = await service.assignConversation(
      ctx({
        hasPermission: (p) =>
          p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.view,
      }),
      { conversationId: "conv-1", assignedUserId: "agent-b", state: "waiting_user" },
    );
    assert.equal(row.assigned_user_id, "agent-b");
    assert.equal(row.state, "waiting_user");
    assert.deepEqual(writes, [
      {
        conversationId: "conv-1",
        assignedUserId: "agent-b",
        state: "waiting_user",
        updatedBy: "user-a",
      },
    ]);
  });

  it("does not allow View Assigned to assign another user's conversation", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ assigned_user_id: "agent-b" }),
      assign: async () => conversation({ assigned_user_id: "agent-a" }),
    } as never);

    await assert.rejects(
      () =>
        service.assignConversation(
          ctx({
            userId: "agent-a",
            hasPermission: (p) =>
              p === CONVERSATION_PERMISSIONS.viewAssigned || p === CONVERSATION_PERMISSIONS.takeover,
          }),
          { conversationId: "conv-1", assignedUserId: "agent-a", state: "waiting_user" },
        ),
      ConversationNotFoundError,
    );
  });
});

describe("ConversationService.releaseConversation", () => {
  it("requires ai.conversations.release and sets assigned_user_id null", async () => {
    const writes: unknown[] = [];
    const denied = new ConversationService({
      findById: async () => conversation({ assigned_user_id: "agent-a" }),
      release: async () => conversation({ assigned_user_id: null }),
    } as never);
    await assert.rejects(
      () =>
        denied.releaseConversation(ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.takeover }), {
          conversationId: "conv-1",
          state: "waiting_user",
        }),
      PermissionDeniedError,
    );

    const service = new ConversationService({
      findById: async () => conversation({ assigned_user_id: "agent-a", state: "waiting_user" }),
      release: async (input) => {
        writes.push(input);
        return conversation({ assigned_user_id: null, state: input.state ?? "waiting_user" });
      },
    } as never);
    const row = await service.releaseConversation(
      ctx({
        hasPermission: (p) =>
          p === CONVERSATION_PERMISSIONS.release || p === CONVERSATION_PERMISSIONS.view,
      }),
      { conversationId: "conv-1", state: "waiting_user" },
    );
    assert.equal(row.assigned_user_id, null);
    assert.deepEqual(writes, [
      { conversationId: "conv-1", state: "waiting_user", updatedBy: "user-a" },
    ]);
  });
});
