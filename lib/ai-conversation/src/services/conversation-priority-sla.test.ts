import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConversationService } from "./conversation-service.ts";
import type { ConversationRepository } from "../repositories/conversation-repository.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ValidationError } from "../errors.ts";

function baseRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-1",
    company_id: "co-a",
    conversation_number: "1",
    company_channel_id: null,
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
    department_id: null,
    metadata: {
      lifecycle: {
        state: "ASSIGNED",
        owner: { kind: "user", id: "u1", label: "Agent" },
        slaDueAt: "2026-09-05T12:00:00.000Z",
        queueId: "q-1",
      },
      keep: true,
    },
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    search_text: "",
    started_at: "2026-09-05T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  } as ConversationRecord;
}

function stubRepo(overrides: Partial<ConversationRepository> = {}): ConversationRepository {
  return {
    create: async () => baseRecord(),
    findById: async () => baseRecord(),
    findByNumber: async () => null,
    list: async () => [],
    close: async () => baseRecord(),
    assign: async () => baseRecord(),
    release: async () => baseRecord(),
    updateState: async () => baseRecord(),
    updatePriority: async (input) =>
      baseRecord({ priority: input.priority, metadata: input.metadata ?? {} }),
    updateMetadata: async () => baseRecord(),
    applyMessageCache: async () => undefined,
    resetEmployeeUnread: async () => baseRecord(),
    resetCustomerUnread: async () => baseRecord(),
    applyStateTransition: async () => baseRecord(),
    touchLastMessageAt: async () => undefined,
    resolveCompanyChannel: async () => null,
    ...overrides,
  };
}

const ctx: ServiceContext = {
  userId: "u1",
  companyId: "co-a",
  isSuperAdmin: false,
  hasPermission: () => true,
};

describe("ConversationService.updatePriority SLA wiring", () => {
  it("D. missing company_id fails closed before write", async () => {
    const superCtx: ServiceContext = { ...ctx, isSuperAdmin: true };
    const service = new ConversationService(
      stubRepo({
        findById: async () => baseRecord({ company_id: "" }),
        updatePriority: async () => {
          throw new Error("should not write");
        },
      }),
      {
        afterPriorityChange: async () => {
          throw new Error("hook should not run");
        },
      },
    );
    await assert.rejects(
      () => service.updatePriority(superCtx, { conversationId: "conv-1", priority: "urgent" }),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  it("F. when repository write fails after SLA compute, no separate metadata write occurs", async () => {
    let metadataCalls = 0;
    let priorityCalls = 0;
    const service = new ConversationService(
      stubRepo({
        updatePriority: async () => {
          priorityCalls += 1;
          throw new Error("db write failed");
        },
        updateMetadata: async () => {
          metadataCalls += 1;
          return baseRecord();
        },
      }),
      {
        afterPriorityChange: async ({ metadata }) => ({
          ...metadata,
          lifecycle: { ...(metadata.lifecycle as object), slaDueAt: "2026-09-05T12:00:00.000Z" },
        }),
      },
    );
    await assert.rejects(
      () => service.updatePriority(ctx, { conversationId: "conv-1", priority: "urgent" }),
      /db write failed/,
    );
    assert.equal(priorityCalls, 1);
    assert.equal(metadataCalls, 0);
  });

  it("atomic priority+metadata write uses NEW priority dueAt and preserves lifecycle fields", async () => {
    let captured: { priority?: string; metadata?: Record<string, unknown> } | null = null;
    const service = new ConversationService(
      stubRepo({
        updatePriority: async (input) => {
          captured = { priority: input.priority, metadata: input.metadata };
          return baseRecord({ priority: input.priority, metadata: input.metadata ?? {} });
        },
        updateMetadata: async () => {
          throw new Error("must not split metadata write");
        },
      }),
      {
        afterPriorityChange: async ({ priority, metadata }) => ({
          ...metadata,
          lifecycle: {
            ...(metadata.lifecycle as object),
            slaDueAt: priority === "urgent" ? "2026-09-05T12:00:00.000Z" : "2026-09-05T22:00:00.000Z",
          },
        }),
      },
    );

    await service.updatePriority(ctx, { conversationId: "conv-1", priority: "urgent" });
    assert.equal(captured?.priority, "urgent");
    assert.equal((captured?.metadata?.lifecycle as { slaDueAt: string }).slaDueAt, "2026-09-05T12:00:00.000Z");
    assert.equal((captured?.metadata?.lifecycle as { state: string }).state, "ASSIGNED");
    assert.equal(captured?.metadata?.keep, true);
  });

  it("when SLA hook throws, priority is not written", async () => {
    let priorityCalls = 0;
    const service = new ConversationService(
      stubRepo({
        updatePriority: async () => {
          priorityCalls += 1;
          return baseRecord();
        },
      }),
      {
        afterPriorityChange: async () => {
          throw new Error("sla settings unavailable");
        },
      },
    );
    await assert.rejects(
      () => service.updatePriority(ctx, { conversationId: "conv-1", priority: "high" }),
      /sla settings unavailable/,
    );
    assert.equal(priorityCalls, 0);
  });
});
