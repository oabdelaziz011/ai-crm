import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import { conversationAggregator } from "./aggregators/conversation-aggregator.js";
import { mergeUnifiedMessagesAcrossChannels } from "./aggregators/message-mapper.js";
import { buildAiAssistModel } from "./services/ai-assist-service.js";
import { buildSuggestedReplyGenerationPrompt } from "./services/suggested-reply-catalog.js";
import { resolveSuggestedReplyTargetLanguage } from "./services/conversation-language-detector.js";
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

describe("inbox view state", () => {
  it("clears unread optimistically after the conversation is viewed", async () => {
    const { applyInboxViewState, effectiveInboxUnreadCount } = await import("./presentation/inbox-view-state.js");
    const conversation = {
      id: "c1",
      unreadCount: 3,
    } as import("./types/unified-conversation.js").UnifiedConversation;
    const acknowledged = new Map([["c1", 3]]);
    assert.equal(effectiveInboxUnreadCount(conversation, acknowledged), 0);
    assert.equal(applyInboxViewState([conversation], acknowledged)[0]?.unreadCount, 0);
  });

  it("shows new unread messages after the server count increases", async () => {
    const { effectiveInboxUnreadCount } = await import("./presentation/inbox-view-state.js");
    const conversation = {
      id: "c1",
      unreadCount: 1,
    } as import("./types/unified-conversation.js").UnifiedConversation;
    const acknowledged = new Map([["c1", 3]]);
    assert.equal(effectiveInboxUnreadCount(conversation, acknowledged), 0);
    const updated = { ...conversation, unreadCount: 4 };
    assert.equal(effectiveInboxUnreadCount(updated, acknowledged), 1);
  });
});

describe("inbox assignee display", () => {
  it("shows a single human name from compound owner labels", async () => {
    const { normalizeInboxAssigneeLabel } = await import("./presentation/inbox-assignee-display.js");
    const labels = { aiEmployee: "AI Employee", unassigned: "Unassigned" };
    assert.equal(
      normalizeInboxAssigneeLabel("AI Employee • Ahmed Ali", "human", labels),
      "Ahmed Ali",
    );
  });

  it("uses localized ai employee label for ai tier", async () => {
    const { resolveInboxAssigneeDisplay } = await import("./presentation/inbox-assignee-display.js");
    const labels = { aiEmployee: "موظف الذكاء الاصطناعي", unassigned: "غير مُسند" };
    assert.deepEqual(resolveInboxAssigneeDisplay("AI Employee", "ai", labels), {
      tier: "ai",
      display: "موظف الذكاء الاصطناعي",
    });
  });
});

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

  it("sorts by lastActivityAt desc with newest conversations first", () => {
    const rows = [
      conversation({ id: "aug-01", last_message_at: "2026-08-01T12:00:00.000Z" }),
      conversation({ id: "jul-20", last_message_at: "2026-07-20T12:00:00.000Z" }),
      conversation({ id: "aug-02", last_message_at: "2026-08-02T12:00:00.000Z" }),
    ];
    const unified = conversationAggregator.aggregateList({
      conversations: rows,
      customersById: new Map(),
      agentsById: new Map(),
    });

    const sorted = conversationAggregator.applyFilters(unified, {
      sortBy: "last_activity",
      sortDirection: "desc",
    });

    assert.deepEqual(
      sorted.map((item) => item.lastActivityAt?.slice(0, 10)),
      ["2026-08-02", "2026-08-01", "2026-07-20"],
    );
  });

  it("sorts by lastActivityAt asc with oldest conversations first", () => {
    const rows = [
      conversation({ id: "aug-02", last_message_at: "2026-08-02T12:00:00.000Z" }),
      conversation({ id: "jul-20", last_message_at: "2026-07-20T12:00:00.000Z" }),
      conversation({ id: "aug-01", last_message_at: "2026-08-01T12:00:00.000Z" }),
    ];
    const unified = conversationAggregator.aggregateList({
      conversations: rows,
      customersById: new Map(),
      agentsById: new Map(),
    });

    const sorted = conversationAggregator.applyFilters(unified, {
      sortBy: "last_activity",
      sortDirection: "asc",
    });

    assert.deepEqual(
      sorted.map((item) => item.lastActivityAt?.slice(0, 10)),
      ["2026-07-20", "2026-08-01", "2026-08-02"],
    );
  });

  it("places CNV-000010 at index 0 when it has the latest lastActivityAt", () => {
    const CNV_000010_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
    const rows = [
      conversation({
        id: CNV_000010_ID,
        conversation_number: "CNV-000010",
        last_message_at: "2026-08-02T00:59:32.0771+00:00",
      }),
      ...Array.from({ length: 27 }, (_, index) =>
        conversation({
          id: `peer-${index}`,
          conversation_number: `CNV-peer-${index}`,
          last_message_at: `2026-07-${String(23 - (index % 20)).padStart(2, "0")}T12:00:00.000Z`,
        }),
      ),
    ];
    const unified = conversationAggregator.aggregateList({
      conversations: rows,
      customersById: new Map(),
      agentsById: new Map(),
    });

    const sorted = conversationAggregator.applyFilters(unified, {
      sortBy: "last_activity",
      sortDirection: "desc",
      archived: false,
    });

    assert.equal(sorted[0]?.id, CNV_000010_ID);
    assert.equal(sorted[0]?.conversationNumber, "CNV-000010");
    assert.equal(sorted.findIndex((item) => item.id === CNV_000010_ID), 0);
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

describe("text direction", () => {
  it("detects Arabic as rtl", async () => {
    const { detectTextDirection, dirAttributeForText, composerDirAttribute } = await import(
      "./presentation/text-direction.js"
    );
    assert.equal(detectTextDirection("مرحبا"), "rtl");
    assert.equal(dirAttributeForText("Hello world"), "ltr");
    assert.equal(composerDirAttribute("أهلا"), "rtl");
  });

  it("keeps phone numbers ltr", async () => {
    const { dirAttributeForField } = await import("./presentation/text-direction.js");
    assert.equal(dirAttributeForField("+966501234567", "phone"), "ltr");
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
    assert.equal(model.customerTone, "angry");
    assert.equal(model.escalationRecommended, true);
    assert.ok(model.suggestedReplies.length > 0);
    assert.equal(model.targetLanguage, "en");
    assert.ok(model.suggestedReplies.every((reply) => /[a-z]/i.test(reply.text)));
    assert.ok(model.suggestedReplies.every((reply) => reply.intent === "support_escalation"));
    assert.ok(model.suggestedReplies[0]!.confidence >= model.suggestedReplies[1]!.confidence);
  });

  it("builds Arabic suggested replies for Arabic conversations", () => {
    const model = buildAiAssistModel([
      {
        id: "m1",
        conversation_id: "1",
        participant_id: null,
        sequence_number: 1,
        message_type: "incoming",
        content_type: "text",
        content: "أريد استرجاع المبلغ",
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

    assert.equal(model.resolvedLanguage, "ar");
    assert.equal(model.targetLanguage, "ar");
    assert.ok(model.suggestedReplies.every((reply) => /[\u0600-\u06FF]/.test(reply.text)));
  });

  it("uses Arabic workspace suggestions when conversation language is auto", () => {
    const model = buildAiAssistModel([], [], { workspaceLanguage: "ar" });

    assert.equal(model.detectedLanguage, "auto");
    assert.equal(model.targetLanguage, "ar");
    assert.ok(model.suggestedReplies.every((reply) => /[\u0600-\u06FF]/.test(reply.text)));
  });

  it("keeps English suggestions for English conversations in an Arabic workspace", () => {
    const model = buildAiAssistModel(
      [
        {
          id: "m1",
          conversation_id: "1",
          participant_id: null,
          sequence_number: 1,
          message_type: "incoming",
          content_type: "text",
          content: "Please help with my invoice",
          metadata: {},
          status: "delivered",
          external_message_id: null,
          attachment_type: null,
          attachment_url: null,
          mime_type: null,
          file_size: null,
          search_text: "invoice",
          created_at: "2026-07-31T10:00:00.000Z",
          created_by: null,
        },
      ],
      [],
      { workspaceLanguage: "ar" },
    );

    assert.equal(model.targetLanguage, "en");
    assert.ok(model.suggestedReplies.every((reply) => /[a-z]/i.test(reply.text)));
    assert.equal(model.suggestedReplies[0]?.intent, "billing");
  });

  it("builds intelligent suggested replies with confidence and explanation metadata", () => {
    const model = buildAiAssistModel([
      {
        id: "m1",
        conversation_id: "1",
        participant_id: null,
        sequence_number: 1,
        message_type: "incoming",
        content_type: "text",
        content: "Please help with my invoice",
        metadata: {},
        status: "delivered",
        external_message_id: null,
        attachment_type: null,
        attachment_url: null,
        mime_type: null,
        file_size: null,
        search_text: "invoice",
        created_at: "2026-07-31T10:00:00.000Z",
        created_by: null,
      },
    ]);

    const reply = model.suggestedReplies[0];
    assert.ok(reply);
    assert.equal(reply.intent, "billing");
    assert.ok(reply.confidence >= 0 && reply.confidence <= 100);
    assert.ok(reply.explanation.reason.length > 0);
    assert.ok(reply.explanation.signalsUsed.includes("intent_classification"));
  });

  it("includes targetLanguage in AI generation prompt", () => {
    const prompt = buildSuggestedReplyGenerationPrompt({
      targetLanguage: "ar",
      lastCustomerMessage: "أريد مساعدة",
      tone: "neutral",
      intent: "استفسار عام",
    });

    assert.equal(prompt.targetLanguage, "ar");
    assert.match(prompt.user, /Arabic/);
    assert.match(prompt.system, /[\u0600-\u06FF]/);
  });

  it("prioritizes agent composer language before workspace language", () => {
    assert.equal(
      resolveSuggestedReplyTargetLanguage({
        conversationDetected: "auto",
        agentComposerLanguage: "en",
        workspaceLanguage: "ar",
      }),
      "en",
    );
  });

  it("respects metadata language over message detection", () => {
    const model = buildAiAssistModel(
      [
        {
          id: "m1",
          conversation_id: "1",
          participant_id: null,
          sequence_number: 1,
          message_type: "incoming",
          content_type: "text",
          content: "hello there",
          metadata: {},
          status: "delivered",
          external_message_id: null,
          attachment_type: null,
          attachment_url: null,
          mime_type: null,
          file_size: null,
          search_text: "hello",
          created_at: "2026-07-31T10:00:00.000Z",
          created_by: null,
        },
      ],
      [],
      { metadata: { language: "ar" } },
    );

    assert.equal(model.resolvedLanguage, "ar");
    assert.equal(model.targetLanguage, "ar");
    assert.ok(model.suggestedReplies.every((reply) => /[\u0600-\u06FF]/.test(reply.text)));
  });
});

describe("outbound delivery integrity", () => {
  it("rejects outbound routes without a channel session", async () => {
    const { validateOutboundRoute } = await import("./services/outbound-delivery.js");
    const result = validateOutboundRoute(null, {
      conversationId: "c1",
      companyChannelId: "cc1",
      channelKey: "whatsapp",
      externalThreadId: "thread-1",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issue.code, "missing_session");
  });

  it("does not treat unconfirmed sent status as confirmed delivery", async () => {
    const { isOutboundDispatchConfirmed, resolveOutboundDeliveryPhase } = await import("./services/outbound-delivery.js");
    const message = {
      id: "m1",
      conversation_id: "c1",
      participant_id: null,
      sequence_number: 1,
      message_type: "outgoing" as const,
      content_type: "text" as const,
      content: "hello",
      metadata: { outboundPhase: "sent" },
      status: "sent" as const,
      external_message_id: null,
      attachment_type: null,
      attachment_url: null,
      mime_type: null,
      file_size: null,
      search_text: "hello",
      created_at: "2026-07-31T10:00:00.000Z",
      created_by: "u1",
    };
    assert.equal(isOutboundDispatchConfirmed(message), false);
    assert.equal(resolveOutboundDeliveryPhase(message), "dispatching");
  });

  it("treats dispatch-confirmed messages as sent", async () => {
    const { isOutboundDispatchConfirmed, resolveOutboundDeliveryPhase } = await import("./services/outbound-delivery.js");
    const message = {
      id: "m2",
      conversation_id: "c1",
      participant_id: null,
      sequence_number: 2,
      message_type: "outgoing" as const,
      content_type: "text" as const,
      content: "hello",
      metadata: { dispatchConfirmed: true, outboundPhase: "sent" },
      status: "sent" as const,
      external_message_id: "ext-1",
      attachment_type: null,
      attachment_url: null,
      mime_type: null,
      file_size: null,
      search_text: "hello",
      created_at: "2026-07-31T10:00:00.000Z",
      created_by: "u1",
    };
    assert.equal(isOutboundDispatchConfirmed(message), true);
    assert.equal(resolveOutboundDeliveryPhase(message), "sent");
  });
});

describe("conversation queues", () => {
  it("includes idle workflow conversations in waiting_ai queue via handlerMode ai", async () => {
    const { applyConversationQueue } = await import("./services/conversation-queues.js");
    const customers = new Map([
      ["cust-1", { id: "cust-1", name: "Jane Doe", phone: "+100", email: null }],
    ]);
    const unified = conversationAggregator.aggregateList({
      conversations: [
        conversation({
          id: "idle-workflow",
          state: "idle",
          last_participant_type: "employee",
          last_message_at: "2026-08-01T23:17:09.000Z",
        }),
        conversation({
          id: "human-assigned",
          state: "transferred_to_human",
          assigned_user_id: "agent-1",
          last_message_at: "2026-08-01T22:00:00.000Z",
        }),
      ],
      customersById: customers,
      agentsById: new Map([["agent-1", { id: "agent-1", name: "Agent" }]]),
    });

    const aiQueue = applyConversationQueue(unified, "waiting_ai", null);
    assert.equal(
      aiQueue.some((item) => item.id === "idle-workflow"),
      true,
      "idle WhatsApp workflow threads must appear in AI queue",
    );
    assert.equal(
      aiQueue.some((item) => item.id === "human-assigned"),
      false,
      "human-assigned conversations must not appear in AI queue",
    );
  });

  it("keeps idle workflow conversations in default all/open inbox queue", async () => {
    const { applyConversationQueue } = await import("./services/conversation-queues.js");
    const unified = conversationAggregator.aggregateList({
      conversations: [conversation({ id: "idle-workflow", state: "idle" })],
      customersById: new Map(),
      agentsById: new Map(),
    });
    const inbox = applyConversationQueue(unified, "all", null);
    assert.equal(inbox.length, 1);
  });
});
