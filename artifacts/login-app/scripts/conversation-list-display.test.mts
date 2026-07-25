import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  buildConversationListDisplay,
  inboxChannelBadgeClass,
  inboxChannelLabel,
} from "../src/lib/conversations/conversation-list-display.ts";

function baseConversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "conv-1",
    company_id: "company-1",
    conversation_number: "CNV-000031",
    company_channel_id: null,
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: "wa-1",
    customer_id: "cust-1",
    assigned_user_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: "2026-07-25T04:46:00.000Z",
    last_message_preview: "55",
    last_participant_type: "customer",
    search_text: "",
    started_at: "2026-07-25T04:45:00.000Z",
    ended_at: null,
    created_at: "2026-07-25T04:45:00.000Z",
    updated_at: "2026-07-25T04:46:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

test("buildConversationListDisplay exposes customer fields without internal identifiers", () => {
  const display = buildConversationListDisplay(baseConversation(), {
    name: "Link Verify 742227",
    phone: "01154742227",
  });

  assert.equal(display.customerName, "Link Verify 742227");
  assert.equal(display.customerPhone, "01154742227");
  assert.equal(display.preview, "55");
});

test("buildConversationListDisplay returns null customer fields when unlinked", () => {
  const display = buildConversationListDisplay(
    baseConversation({ customer_id: null, last_message_preview: "Hello" }),
    null,
  );

  assert.equal(display.customerName, null);
  assert.equal(display.customerPhone, null);
  assert.equal(display.preview, "Hello");
});

test("inboxChannelLabel formats WhatsApp", () => {
  assert.equal(inboxChannelLabel("whatsapp"), "WhatsApp");
  assert.equal(inboxChannelLabel("facebook"), "Facebook");
  assert.equal(inboxChannelLabel("instagram"), "Instagram");
});

test("inboxChannelBadgeClass returns channel-specific styling", () => {
  assert.match(inboxChannelBadgeClass("whatsapp"), /emerald/);
  assert.match(inboxChannelBadgeClass("facebook"), /blue/);
});
