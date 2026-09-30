import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ConversationMessageRecord, ConversationRecord } from "@workspace/ai-conversation";
import { conversationAggregator } from "./aggregators/conversation-aggregator.js";
import { mapUnifiedMessage } from "./aggregators/message-mapper.js";
import {
  canViewPublicWebChatInbox,
  filterConversationsByChannelPermission,
  filterConversationsByOwnership,
  resolveOmnichannelInboxChannels,
  type OmnichannelAccess,
} from "./permissions.js";
import { mapListFilters } from "./services/omnichannel-list-filters.js";
import {
  confirmPublicWebChatVisitorPollingReply,
  PUBLIC_WEB_CHAT_DELIVERY_MODE,
  resolvePublicWebChatReplyPlan,
  type PublicWebChatReplyClient,
} from "./services/public-web-chat-reply.js";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "./types/unified-conversation.js";

const here = dirname(fileURLToPath(import.meta.url));

const PUBLIC_METADATA = {
  publicWebChat: true,
  channelProvider: "valueor.web_widget",
  webChatWidgetId: "widget-1",
  webChatVisitorSessionId: "session-1",
  externalThreadId: "webchat:session-1",
  channelIdentityStatus: "anonymous_visitor",
  trustedChannelCustomerId: null,
};

function row(partial: Partial<ConversationRecord> & Pick<ConversationRecord, "id">): ConversationRecord {
  return {
    company_id: "company-a",
    conversation_number: `CNV-${partial.id}`,
    company_channel_id: "cc-1",
    ai_assistant_id: "ai-1",
    channel_type: "whatsapp",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: "thread-1",
    customer_id: null,
    assigned_user_id: null,
    department_id: null,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: "2026-09-28T10:00:00.000Z",
    last_message_preview: "Hello",
    last_participant_type: "customer",
    search_text: "hello",
    started_at: "2026-09-28T09:00:00.000Z",
    ended_at: null,
    created_at: "2026-09-28T09:00:00.000Z",
    updated_at: "2026-09-28T10:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...partial,
  } as ConversationRecord;
}

const publicChat = row({
  id: "web-public",
  channel_type: "web_chat",
  company_channel_id: "widget-channel",
  external_thread_id: "webchat:session-1",
  metadata: PUBLIC_METADATA,
  unread_count_employee: 2,
  last_message_preview: "Is anyone there?",
  last_message_at: "2026-09-28T11:30:00.000Z",
});
const internalAiChat = row({
  id: "web-internal",
  channel_type: "web_chat",
  company_channel_id: "internal-channel",
  metadata: { channelProvider: "generic.web_chat" },
});
const spoofedInternal = row({
  id: "web-spoofed",
  channel_type: "web_chat",
  metadata: { publicWebChat: true, channelProvider: "generic.web_chat" },
});
const whatsapp = row({ id: "wa", channel_type: "whatsapp" });
const instagram = row({ id: "ig", channel_type: "instagram" });
const messenger = row({ id: "fb", channel_type: "messenger" });
const sms = row({ id: "sms", channel_type: "sms" });
const email = row({ id: "email", channel_type: "email" });

function access(codes: string[], extra: Partial<OmnichannelAccess> = {}): OmnichannelAccess {
  return {
    userId: "user-1",
    companyId: "company-a",
    isSuperAdmin: false,
    hasPermission: (code) => codes.includes(code),
    ...extra,
  };
}

function inbox(rows: ConversationRecord[], who: OmnichannelAccess) {
  const unified = conversationAggregator.aggregateList({
    conversations: rows,
    customersById: new Map(),
    agentsById: new Map(),
  });
  const supported = conversationAggregator.filterBySupportedChannels(unified, {
    includePublicWebChat: canViewPublicWebChatInbox(who),
  });
  return filterConversationsByChannelPermission(supported, resolveOmnichannelInboxChannels(who));
}

const ALL_ROWS = [publicChat, internalAiChat, spoofedInternal, whatsapp, instagram, messenger, sms, email];
const WEB_CHAT_AGENT = access(["ai.conversations.view", "ai.conversations.reply", "web_presence.view"]);
const CHANNEL_ONLY_AGENT = access([
  "ai.conversations.view",
  "ai.conversations.reply",
  "whatsapp.view",
  "sms.view",
  "instagram.view",
  "messenger.view",
  "channels.view",
]);

describe("Phase 2.1 — public Web Chat in the Omnichannel inbox", () => {
  it("1. public widget conversation appears as Live Chat for a Web Chat user", () => {
    const ids = inbox(ALL_ROWS, WEB_CHAT_AGENT).map((item) => item.id);
    assert.ok(ids.includes("web-public"));
  });

  it("2. internal AI chat (and a spoofed provider) never appears, even with Web Chat access", () => {
    for (const who of [WEB_CHAT_AGENT, access([], { isSuperAdmin: true })]) {
      const ids = inbox(ALL_ROWS, who).map((item) => item.id);
      assert.equal(ids.includes("web-internal"), false);
      assert.equal(ids.includes("web-spoofed"), false);
    }
    // Even a caller passing web_chat in the allowlist cannot surface internal chat.
    const unified = conversationAggregator.aggregateList({
      conversations: [internalAiChat],
      customersById: new Map(),
      agentsById: new Map(),
    });
    assert.deepEqual(filterConversationsByChannelPermission(unified, ["web_chat"]), []);
  });

  it("3. permission filtering: Web Chat needs web_presence.view/manage — other channel grants do not imply it", () => {
    assert.equal(canViewPublicWebChatInbox(CHANNEL_ONLY_AGENT), false);
    assert.equal(inbox(ALL_ROWS, CHANNEL_ONLY_AGENT).some((item) => item.id === "web-public"), false);
    assert.equal(canViewPublicWebChatInbox(access(["ai.conversations.view", "web_presence.manage"])), true);
    assert.equal(canViewPublicWebChatInbox(access([], { isSuperAdmin: true })), true);
    // Web Presence alone without inbox view does not open the inbox.
    assert.equal(canViewPublicWebChatInbox(access(["web_presence.view", "web_presence.manage"])), false);
    assert.equal(canViewPublicWebChatInbox(null), false);
  });

  it("5. assigned visibility: desk agents only see Web Chat rows they own", () => {
    const mine = row({ ...publicChat, id: "web-mine", assigned_user_id: "user-1" });
    const theirs = row({ ...publicChat, id: "web-theirs", assigned_user_id: "user-2" });
    const visible = inbox([mine, theirs], WEB_CHAT_AGENT);
    const owned = filterConversationsByOwnership(visible, WEB_CHAT_AGENT, true).map((item) => item.id);
    assert.deepEqual(owned, ["web-mine"]);
  });

  it("7/8. unread, latest message, timestamps and handoff state come from the conversation row", () => {
    const escalated = row({ ...publicChat, state: "transferred_to_human" });
    const [item] = inbox([escalated], WEB_CHAT_AGENT);
    assert.ok(item);
    assert.equal(item.channel, "web_chat");
    assert.equal(item.unreadCount, 2);
    assert.equal(item.lastMessage, "Is anyone there?");
    assert.equal(item.lastActivityAt, "2026-09-28T11:30:00.000Z");
    assert.equal(item.companyChannelId, "widget-channel");
    assert.equal(item.status, "transferred_to_human");
  });

  it("9. selection: the selectable list contains the widget conversation exactly once", () => {
    const visible = inbox([publicChat, publicChat, whatsapp], WEB_CHAT_AGENT);
    const selectable = new Map(visible.map((item) => [item.id, item]));
    assert.ok(selectable.get("web-public"));
    assert.equal(inbox([publicChat], CHANNEL_ONLY_AGENT).find((item) => item.id === "web-public"), undefined);
  });

  it("list query filters: widget scope only when permitted; forged web_chat chip is dropped", () => {
    const permitted = mapListFilters({}, { includePublicWebChat: true });
    assert.deepEqual(permitted.channelTypes, OMNICHANNEL_PRIMARY_CHANNELS);
    assert.equal(permitted.includePublicWebChat, true);

    const denied = mapListFilters({ channel: "web_chat" }, { includePublicWebChat: false });
    assert.equal(denied.channelType, undefined);
    assert.deepEqual(denied.channelTypes, OMNICHANNEL_PRIMARY_CHANNELS);
    assert.equal(denied.includePublicWebChat, false);

    const chip = mapListFilters({ channel: "web_chat" }, { includePublicWebChat: true });
    assert.equal(chip.channelType, "web_chat");
    assert.equal(chip.includePublicWebChat, true);
  });

  it("18–22. existing primary channels unchanged; public web chat is additive only", () => {
    const withoutWeb = inbox(ALL_ROWS, CHANNEL_ONLY_AGENT).map((item) => item.id);
    for (const id of ["wa", "ig", "fb"]) assert.ok(withoutWeb.includes(id), `${id} listed`);
    assert.equal(withoutWeb.includes("web-public"), false);
    const withWeb = inbox(ALL_ROWS, WEB_CHAT_AGENT).map((item) => item.id);
    for (const id of ["wa", "ig", "fb"]) assert.ok(withWeb.includes(id), `${id} listed`);
    assert.ok(withWeb.includes("web-public"));
    assert.deepEqual(resolveOmnichannelInboxChannels(CHANNEL_ONLY_AGENT), OMNICHANNEL_PRIMARY_CHANNELS);
    assert.deepEqual(mapListFilters({}).channelTypes, OMNICHANNEL_PRIMARY_CHANNELS);
    assert.equal(mapListFilters({}).includePublicWebChat, false);
  });
});

function fakeClient(
  conversation: { id: string; company_id: string; channel_type: string | null; metadata: unknown } | null,
  rpcError: { message: string } | null = null,
) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client: PublicWebChatReplyClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: conversation, error: null }),
        }),
      }),
    }),
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return { data: null, error: rpcError };
    },
  };
  return { client, calls };
}

describe("Phase 2.1 — staff reply path (visitor polling, no fake delivery)", () => {
  const base = { conversationId: "web-public", companyId: "company-a", hasAttachments: false, canViewPublicWebChat: true };

  it("10/13. public widget reply is confirmed as sent — never delivered/read, no provider", async () => {
    const { client, calls } = fakeClient(publicChat);
    assert.deepEqual(await resolvePublicWebChatReplyPlan(client, base), { kind: "public_web_chat" });
    const result = await confirmPublicWebChatVisitorPollingReply(client, "msg-1");
    assert.equal(result.deliveryStatus, "sent");
    assert.equal(result.deliveryMode, PUBLIC_WEB_CHAT_DELIVERY_MODE);
    assert.equal(PUBLIC_WEB_CHAT_DELIVERY_MODE, "visitor_polling");
    assert.deepEqual(calls, [
      {
        fn: "confirm_conversation_message_outbound",
        args: { p_message_id: "msg-1", p_status: "sent", p_external_message_id: null },
      },
    ]);
  });

  it("reply plan does not require assigned_user_id (inbox assignment is list-scope, not this RPC)", async () => {
    const { client } = fakeClient({ ...publicChat, assigned_user_id: null });
    assert.deepEqual(
      await resolvePublicWebChatReplyPlan(client, base),
      { kind: "public_web_chat" },
    );
  });

  it("confirm failure surfaces as an error (hook then marks the message failed)", async () => {
    const { client } = fakeClient(publicChat, { message: "Insufficient permissions to confirm outbound message" });
    await assert.rejects(() => confirmPublicWebChatVisitorPollingReply(client, "msg-1"), /Insufficient permissions/);
  });

  it("16. forged company / invisible conversation is rejected", async () => {
    assert.equal((await resolvePublicWebChatReplyPlan(fakeClient({ ...publicChat, company_id: "company-b" }).client, base)).kind, "rejected");
    assert.equal((await resolvePublicWebChatReplyPlan(fakeClient(null).client, base)).kind, "rejected");
  });

  it("3. reply requires Web Chat access; attachments are refused (visitor poll is text-only)", async () => {
    const { client } = fakeClient(publicChat);
    assert.equal((await resolvePublicWebChatReplyPlan(client, { ...base, canViewPublicWebChat: false })).kind, "rejected");
    assert.equal((await resolvePublicWebChatReplyPlan(client, { ...base, hasAttachments: true })).kind, "rejected");
  });

  it("17. internal AI chat is not treated as public (existing path untouched)", async () => {
    const { client, calls } = fakeClient(internalAiChat);
    assert.deepEqual(await resolvePublicWebChatReplyPlan(client, base), { kind: "not_public_web_chat" });
    assert.equal(calls.length, 0);
  });

  it("migration 401: DB guard is scoped to authenticated outgoing replies on public widget conversations", () => {
    const sql = readFileSync(resolve(here, "../../../../../supabase/migrations/401_web_chat_public_staff_reply_guard.sql"), "utf8");
    assert.match(sql, /new\.message_type is distinct from 'outgoing'/);
    assert.match(sql, /auth\.role\(\) is distinct from 'authenticated'/);
    assert.match(sql, /v_channel_type = 'web_chat'/);
    assert.match(sql, /v_metadata->>'publicWebChat', ''\) = 'true'/);
    assert.match(sql, /v_metadata->>'channelProvider' = 'valueor\.web_widget'/);
    assert.match(sql, /company_has_permission\(v_company_id, 'web_presence\.view'\)/);
    assert.match(sql, /company_has_permission\(v_company_id, 'web_presence\.manage'\)/);
    assert.match(sql, /before insert on public\.conversation_messages/);
    assert.doesNotMatch(sql, /drop policy|create policy|alter policy/i);
  });

  it("reply hook: only web_chat consults the plan; other channels keep the dispatcher", () => {
    const source = readFileSync(resolve(here, "../../hooks/conversations/use-team-inbox-reply.ts"), "utf8");
    assert.match(source, /if \(target\.channelKey === "web_chat"\) \{\s*const plan = await resolvePublicWebChatReplyPlan/);
    assert.match(source, /isPublicWebChat \? null : await resolveChannelSession/);
    assert.match(source, /!route\s*\?\s*await confirmPublicWebChatVisitorPollingReply/);
    assert.match(source, /deliveryMode: PUBLIC_WEB_CHAT_DELIVERY_MODE/);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE|visitorToken|anonKey/);
  });
});

function message(partial: Partial<ConversationMessageRecord>): ConversationMessageRecord {
  return {
    id: "m",
    conversation_id: "web-public",
    participant_id: null,
    sequence_number: 1,
    message_type: "outgoing",
    content_type: "text",
    content: "hi",
    metadata: {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "hi",
    created_at: "2026-09-28T11:00:00.000Z",
    created_by: null,
    ...partial,
  } as ConversationMessageRecord;
}

describe("Phase 2.1 — conversation details", () => {
  it("6. visitor, AI and staff messages are attributed like the visitor poll", () => {
    const visitor = mapUnifiedMessage(message({ message_type: "incoming", metadata: { publicWebChat: true } }), "web_chat");
    const ai = mapUnifiedMessage(message({ metadata: { runtimeExecutionId: "run-1" } }), "web_chat");
    const fallback = mapUnifiedMessage(message({ metadata: { webChatFallback: true, source: "public_web_chat" } }), "web_chat");
    const staff = mapUnifiedMessage(
      message({ created_by: "user-1", metadata: { source: "team_inbox", agentUserId: "user-1", deliveryMode: "visitor_polling" } }),
      "web_chat",
    );
    assert.equal(visitor.senderType, "customer");
    assert.equal(ai.senderType, "assistant");
    assert.equal(fallback.senderType, "assistant");
    assert.equal(staff.senderType, "agent");
  });

  it("18. WhatsApp outgoing attribution is unchanged", () => {
    assert.equal(mapUnifiedMessage(message({ metadata: { runtimeExecutionId: "run-1" } }), "whatsapp").senderType, "agent");
  });

  it("12. rendered fields carry no token, hash, IP or user-agent data", () => {
    const [item] = inbox([publicChat], WEB_CHAT_AGENT);
    const rendered = JSON.stringify({ ...item, source: undefined });
    assert.doesNotMatch(rendered, /token|hash|user_?agent|ip_/i);
    assert.doesNotMatch(JSON.stringify(PUBLIC_METADATA), /token|hash|user_?agent|ip_/i);
  });
});
