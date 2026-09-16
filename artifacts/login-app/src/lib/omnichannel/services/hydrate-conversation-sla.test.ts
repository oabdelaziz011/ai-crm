import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord, ConversationServices, ServiceContext } from "@workspace/ai-conversation";
import { hydrateConversationSlaDueAtBatch } from "./hydrate-conversation-sla.ts";
import { readLifecycleSlaDueAt } from "@workspace/ticket-platform";

function baseRow(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-1",
    company_id: "co-a",
    conversation_number: 1,
    ai_assistant_id: "ai-1",
    company_channel_id: null,
    channel_type: "web",
    state: "waiting_user",
    priority: "urgent",
    assigned_user_id: null,
    customer_id: null,
    external_thread_id: null,
    metadata: {},
    started_at: "2026-09-05T10:00:00.000Z",
    last_message_at: "2026-09-05T10:00:00.000Z",
    closed_at: null,
    created_at: "2026-09-05T10:00:00.000Z",
    updated_at: "2026-09-05T10:00:00.000Z",
    created_by: null,
    updated_by: null,
    ...overrides,
  } as ConversationRecord;
}

describe("hydrateConversationSlaDueAtBatch (ticket-centric no-op)", () => {
  it("does not invent SLA for conversations without tickets", async () => {
    const row = baseRow();
    let updateCalls = 0;
    const services = {
      conversations: {
        updateMetadata: async () => {
          updateCalls += 1;
          return row;
        },
      },
    } as unknown as ConversationServices;

    const [next] = await hydrateConversationSlaDueAtBatch({
      client: { from: () => ({}) } as never,
      services,
      ctx: { userId: "u1", companyId: "co-a", isSuperAdmin: false, hasPermission: () => true },
      conversations: [row],
    });

    assert.equal(updateCalls, 0);
    assert.equal(readLifecycleSlaDueAt(next.metadata), null);
  });

  it("leaves stale lifecycle.slaDueAt untouched (no rewrite, no delete)", async () => {
    let updateCalls = 0;
    const row = baseRow({
      metadata: { lifecycle: { slaDueAt: "2026-09-01T00:00:00.000Z" } },
    });
    const services = {
      conversations: {
        updateMetadata: async () => {
          updateCalls += 1;
          return row;
        },
      },
    } as unknown as ConversationServices;

    const out = await hydrateConversationSlaDueAtBatch({
      client: { from: () => ({}) } as never,
      services,
      ctx: { userId: "u1", companyId: "co-a", isSuperAdmin: false, hasPermission: () => true },
      conversations: [row],
    });

    assert.equal(updateCalls, 0);
    assert.equal(readLifecycleSlaDueAt(out[0]!.metadata), "2026-09-01T00:00:00.000Z");
  });
});
