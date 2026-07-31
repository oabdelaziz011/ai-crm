import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { conversationAggregator } from "./aggregators/conversation-aggregator.js";
import { mergeUnifiedMessagesAcrossChannels } from "./aggregators/message-mapper.js";
import { buildAiAssistModel } from "./services/ai-assist-service.js";
import { computeConversationListWindow } from "./virtualization/conversation-list-window.js";
import {
  canViewOmnichannelConsole,
  filterConversationsByChannelPermission,
} from "./permissions.js";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "./types/unified-conversation.js";

function conversation(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "company-1",
    conversation_number: "CNV-1",
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: "thread-1",
    customer_id: "cust-1",
    assigned_user_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 1,
    unread_count_customer: 0,
    last_message_at: "2026-07-31T12:00:00.000Z",
    last_message_preview: "Hello",
    last_participant_type: "customer",
    search_text: "hello",
    started_at: "2026-07-31T10:00:00.000Z",
    ended_at: null,
    created_at: "2026-07-31T10:00:00.000Z",
    updated_at: "2026-07-31T12:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...partial,
  };
}

describe("ConversationAggregator", () => {
  it("aggregates and filters conversations by channel and search", () => {
    const customers = new Map([
      ["cust-1", { id: "cust-1", name: "Jane Doe", phone: "+100", email: null }],
    ]);
    const agents = new Map<string, { id: string; name: string }>();

    const unified = conversationAggregator.aggregateList({
      conversations: [
        conversation({ id: "1", channel_type: "whatsapp" }),
        conversation({ id: "2", channel_type: "email", customer_id: "cust-2", last_message_preview: "Invoice" }),
      ],
      customersById: customers,
      agentsById: agents,
    });

    const whatsappOnly = conversationAggregator.applyFilters(unified, { channel: "whatsapp" });
    assert.equal(whatsappOnly.length, 1);
    assert.equal(whatsappOnly[0]?.channel, "whatsapp");

    const searched = conversationAggregator.applyFilters(unified, { search: "invoice" });
    assert.equal(searched.length, 1);
  });

  it("merges customer threads by latest activity", () => {
    const customers = new Map([
      ["cust-1", { id: "cust-1", name: "Jane Doe", phone: "+100", email: null }],
    ]);
    const unified = conversationAggregator.aggregateList({
      conversations: [
        conversation({ id: "1", last_message_at: "2026-07-31T10:00:00.000Z", channel_type: "whatsapp" }),
        conversation({ id: "2", last_message_at: "2026-07-31T12:00:00.000Z", channel_type: "email" }),
      ],
      customersById: customers,
      agentsById: new Map(),
    });

    const merged = conversationAggregator.mergeByCustomer(unified);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.channel, "email");
    assert.equal(merged[0]?.unreadCount, 2);
  });
});

describe("message mapping", () => {
  it("merges messages across channels chronologically", () => {
    const merged = mergeUnifiedMessagesAcrossChannels([
      {
        channel: "whatsapp",
        messages: [
          {
            id: "m1",
            conversation_id: "1",
            participant_id: null,
            sequence_number: 1,
            message_type: "incoming",
            content_type: "text",
            content: "Hi",
            metadata: {},
            status: "delivered",
            external_message_id: null,
            attachment_type: null,
            attachment_url: null,
            mime_type: null,
            file_size: null,
            search_text: "hi",
            created_at: "2026-07-31T10:00:00.000Z",
            created_by: null,
          },
        ],
      },
      {
        channel: "email",
        messages: [
          {
            id: "m2",
            conversation_id: "2",
            participant_id: null,
            sequence_number: 1,
            message_type: "incoming",
            content_type: "text",
            content: "Follow up",
            metadata: {},
            status: "delivered",
            external_message_id: null,
            attachment_type: null,
            attachment_url: null,
            mime_type: null,
            file_size: null,
            search_text: "follow",
            created_at: "2026-07-31T11:00:00.000Z",
            created_by: null,
          },
        ],
      },
    ]);

    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.channel, "whatsapp");
    assert.equal(merged[1]?.channel, "email");
  });
});

describe("permissions and performance", () => {
  it("filters by channel permission and access", () => {
    const rows = [
      { channel: "whatsapp" },
      { channel: "telegram" },
    ];
    const allowed = filterConversationsByChannelPermission(rows, OMNICHANNEL_PRIMARY_CHANNELS);
    assert.equal(allowed.length, 1);

    assert.equal(
      canViewOmnichannelConsole({
        userId: "u1",
        companyId: "c1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "ai.conversations.view",
      }),
      true,
    );
  });

  it("virtualizes large conversation lists", () => {
    const window = computeConversationListWindow(500, 1200, 640);
    assert.ok(window.endIndex > window.startIndex);
    assert.ok(window.totalHeight > 640);
  });
});

describe("AI assist", () => {
  it("builds suggested replies and escalation hints", () => {
    const model = buildAiAssistModel([
      {
        id: "m1",
        conversation_id: "1",
        participant_id: null,
        sequence_number: 1,
        message_type: "incoming",
        content_type: "text",
        content: "I need a refund, this is a complaint",
        metadata: {},
        status: "delivered",
        external_message_id: null,
        attachment_type: null,
        attachment_url: null,
        mime_type: null,
        file_size: null,
        search_text: "refund",
        created_at: "2026-07-31T10:00:00.000Z",
        created_by: null,
      },
    ]);

    assert.equal(model.sentiment, "negative");
    assert.equal(model.escalationRecommended, true);
    assert.ok(model.suggestedReplies.length > 0);
  });
});
