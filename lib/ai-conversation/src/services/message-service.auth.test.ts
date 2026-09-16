/**
 * MessageService authorization remains aligned with Phase 2A RLS taxonomy.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_PERMISSIONS } from "../constants.js";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.js";
import { MessageService } from "./message-service.js";
import type {
  ConversationMessageRecord,
  ConversationRecord,
  ServiceContext,
} from "../types.js";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "user-a",
    companyId: partial.companyId ?? "company-a",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
    departmentId: partial.departmentId,
    managedDepartmentIds: partial.managedDepartmentIds,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-a",
    company_id: "company-a",
    conversation_number: "1",
    company_channel_id: null,
    ai_assistant_id: "asst-a",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "open",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    department_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    search_text: "",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function messageRecord(): ConversationMessageRecord {
  return {
    id: "msg-1",
    conversation_id: "conv-a",
    participant_id: null,
    sequence_number: 1,
    message_type: "outgoing",
    content_type: "text",
    content: "hello",
    metadata: {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "hello",
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
  };
}

function messageRepo(overrides: Record<string, unknown> = {}) {
  return {
    list: async () => [] as ConversationMessageRecord[],
    add: async () => messageRecord(),
    findById: async () => null,
    findByConversationAndExternalMessageId: async () => null,
    findByConversationAndInboundCorrelationId: async () => null,
    ...overrides,
  } as never;
}

function conversationRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: async () => conversation(),
    applyMessageCache: async () => undefined,
    resetEmployeeUnread: async () => conversation(),
    resetCustomerUnread: async () => conversation(),
    ...overrides,
  } as never;
}

describe("MessageService auth (Phase 2A alignment)", () => {
  it("denies listMessages without ai.conversations.view", async () => {
    const service = new MessageService(
      messageRepo(),
      conversationRepo(),
      { findById: async () => null } as never,
    );

    await assert.rejects(
      () =>
        service.listMessages(
          ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.reply }),
          { conversationId: "conv-a" },
        ),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("allows listMessages with ai.conversations.view for same company", async () => {
    const service = new MessageService(
      messageRepo({ list: async () => [messageRecord()] }),
      conversationRepo(),
      { findById: async () => null } as never,
    );

    const rows = await service.listMessages(
      ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
      { conversationId: "conv-a" },
    );
    assert.equal(rows.length, 1);
  });

  it("allows listMessages with view_assigned only for own assignee", async () => {
    const service = new MessageService(
      messageRepo({ list: async () => [messageRecord()] }),
      conversationRepo({
        findById: async () => conversation({ assigned_user_id: "user-a" }),
      }),
      { findById: async () => null } as never,
    );

    const rows = await service.listMessages(
      ctx({
        userId: "user-a",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      { conversationId: "conv-a" },
    );
    assert.equal(rows.length, 1);
  });

  it("allows listMessages for view_assigned on own-department unassigned queue", async () => {
    const service = new MessageService(
      messageRepo({ list: async () => [messageRecord()] }),
      conversationRepo({
        findById: async () => conversation({ assigned_user_id: null, department_id: "dept-sales" }),
      }),
      { findById: async () => null } as never,
    );

    const rows = await service.listMessages(
      ctx({
        userId: "user-a",
        departmentId: "dept-sales",
        hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
      }),
      { conversationId: "conv-a" },
    );
    assert.equal(rows.length, 1);
  });

  it("denies listMessages for view_assigned when parent conversation is inaccessible", async () => {
    const service = new MessageService(
      messageRepo(),
      conversationRepo({
        findById: async () => conversation({ assigned_user_id: null, department_id: "dept-support" }),
      }),
      { findById: async () => null } as never,
    );

    await assert.rejects(
      () =>
        service.listMessages(
          ctx({
            userId: "user-a",
            departmentId: "dept-sales",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          { conversationId: "conv-a" },
        ),
      (err: unknown) => err instanceof ConversationNotFoundError,
    );
  });

  it("denies addMessage without ai.conversations.reply", async () => {
    const service = new MessageService(
      messageRepo(),
      conversationRepo(),
      { findById: async () => null } as never,
    );

    await assert.rejects(
      () =>
        service.addMessage(
          ctx({ hasPermission: (p) => p === CONVERSATION_PERMISSIONS.view }),
          {
            conversationId: "conv-a",
            messageType: "outgoing",
            contentType: "text",
            content: "hi",
          },
        ),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("denies cross-company addMessage even with reply", async () => {
    const service = new MessageService(
      messageRepo(),
      conversationRepo({
        findById: async () => conversation({ company_id: "company-b" }),
      }),
      { findById: async () => null } as never,
    );

    await assert.rejects(
      () =>
        service.addMessage(
          ctx({
            companyId: "company-a",
            hasPermission: (p) => p === CONVERSATION_PERMISSIONS.reply,
          }),
          {
            conversationId: "conv-a",
            messageType: "internal_note",
            contentType: "text",
            content: "note",
          },
        ),
      (err: unknown) => err instanceof PermissionDeniedError,
    );
  });

  it("super-admin can addMessage without permission codes (intentional)", async () => {
    let added = false;
    const service = new MessageService(
      messageRepo({
        add: async () => {
          added = true;
          return messageRecord();
        },
      }),
      conversationRepo({
        findById: async () => conversation({ company_id: "company-b" }),
      }),
      { findById: async () => null } as never,
    );

    await service.addMessage(
      ctx({
        isSuperAdmin: true,
        companyId: "company-a",
        hasPermission: () => false,
      }),
      {
        conversationId: "conv-a",
        messageType: "outgoing",
        contentType: "text",
        content: "sa",
      },
    );
    assert.equal(added, true);
  });
});
