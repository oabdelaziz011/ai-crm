import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PermissionDeniedError,
  type ConversationMessageRecord,
  type ConversationRecord,
  type ServiceContext,
} from "@workspace/ai-conversation";
import {
  canViewCustomerSmsTab,
  customerSmsMessageSnippet,
  customerSmsOpenConversationHref,
  CUSTOMER_SMS_COMMERCIAL_FEATURE,
  CUSTOMER_SMS_PAGE_SIZE,
  CUSTOMER_SMS_VIEW_PERMISSION,
  filterCustomerSmsConversations,
  isCustomerLinkedSmsConversation,
  listCustomerSmsConversations,
  normalizeCustomerSmsDeliveryStatus,
  resolveCustomerSmsDirection,
  resolveCustomerSmsMessageActor,
  resolveCustomerSmsThreadPhone,
} from "./customer-sms-timeline.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(__dirname, "../..");

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? "company-1",
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "sms",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "waiting_user",
    external_thread_id: overrides.external_thread_id ?? "+15551234567",
    customer_id: "customer_id" in overrides ? (overrides.customer_id ?? null) : "cust-1",
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? null,
    metadata: overrides.metadata ?? {},
    priority: overrides.priority ?? "normal",
    locked_by: overrides.locked_by ?? null,
    locked_at: overrides.locked_at ?? null,
    unread_count_employee: overrides.unread_count_employee ?? 0,
    unread_count_customer: overrides.unread_count_customer ?? 0,
    last_message_at: overrides.last_message_at ?? "2026-09-16T00:00:00.000Z",
    last_message_preview: overrides.last_message_preview ?? "Hello",
    last_participant_type: overrides.last_participant_type ?? "customer",
    search_text: overrides.search_text ?? "",
    started_at: overrides.started_at ?? "2026-09-16T00:00:00.000Z",
    ended_at: overrides.ended_at ?? null,
    created_at: overrides.created_at ?? "2026-09-16T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-09-16T00:00:00.000Z",
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    deleted_at: overrides.deleted_at ?? null,
    deleted_by: overrides.deleted_by ?? null,
  };
}

function message(overrides: Partial<ConversationMessageRecord> = {}): ConversationMessageRecord {
  return {
    id: overrides.id ?? "msg-1",
    conversation_id: overrides.conversation_id ?? "conv-1",
    participant_id: overrides.participant_id ?? null,
    sequence_number: overrides.sequence_number ?? 1,
    message_type: overrides.message_type ?? "outgoing",
    content_type: overrides.content_type ?? "text",
    content: overrides.content ?? "Body",
    metadata: overrides.metadata ?? {},
    status: overrides.status ?? "sent",
    external_message_id: overrides.external_message_id ?? null,
    attachment_type: overrides.attachment_type ?? null,
    attachment_url: overrides.attachment_url ?? null,
    mime_type: overrides.mime_type ?? null,
    file_size: overrides.file_size ?? null,
    search_text: overrides.search_text ?? "",
    created_at: overrides.created_at ?? "2026-09-16T00:00:00.000Z",
    created_by: overrides.created_by ?? null,
  };
}

describe("customer SMS permission + commercial gate", () => {
  it("requires sms.view and sms_channel; CRM-only users cannot view", () => {
    assert.equal(CUSTOMER_SMS_VIEW_PERMISSION, "sms.view");
    assert.equal(CUSTOMER_SMS_COMMERCIAL_FEATURE, "sms_channel");
    assert.equal(
      canViewCustomerSmsTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "customers.view",
        smsChannelEntitled: true,
      }),
      false,
    );
    assert.equal(
      canViewCustomerSmsTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "sms.view",
        smsChannelEntitled: false,
      }),
      false,
    );
    assert.equal(
      canViewCustomerSmsTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "sms.view",
        smsChannelEntitled: undefined,
      }),
      false,
    );
    assert.equal(
      canViewCustomerSmsTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "sms.view",
        smsChannelEntitled: true,
      }),
      true,
    );
    assert.equal(
      canViewCustomerSmsTab({
        isSuperAdmin: true,
        hasPermission: () => false,
        smsChannelEntitled: false,
      }),
      true,
    );
  });

  it("unauthorized listCustomerSmsConversations rejects before querying", async () => {
    let listed = false;
    await assert.rejects(
      () =>
        listCustomerSmsConversations({
          ctx: {
            userId: "u1",
            companyId: "company-1",
            isSuperAdmin: false,
            hasPermission: (p) => p === "customers.view" || p === "ai.conversations.view",
          } satisfies ServiceContext,
          conversations: {
            listConversations: async () => {
              listed = true;
              return [conversation()];
            },
          } as never,
          companyId: "company-1",
          customerId: "cust-1",
          smsChannelEntitled: true,
        }),
      PermissionDeniedError,
    );
    assert.equal(listed, false);
  });

  it("no query when sms_channel entitlement is false", async () => {
    let listed = false;
    await assert.rejects(
      () =>
        listCustomerSmsConversations({
          ctx: {
            userId: "u1",
            companyId: "company-1",
            isSuperAdmin: false,
            hasPermission: (p) => p === "sms.view",
          } satisfies ServiceContext,
          conversations: {
            listConversations: async () => {
              listed = true;
              return [conversation()];
            },
          } as never,
          companyId: "company-1",
          customerId: "cust-1",
          smsChannelEntitled: false,
        }),
      PermissionDeniedError,
    );
    assert.equal(listed, false);
  });
});

describe("customer SMS linkage + filters", () => {
  it("keeps only company + sms + matching customer_id", () => {
    assert.equal(
      isCustomerLinkedSmsConversation({
        conversation: conversation(),
        companyId: "company-1",
        customerId: "cust-1",
      }),
      true,
    );
    assert.equal(
      isCustomerLinkedSmsConversation({
        conversation: conversation({ customer_id: null }),
        companyId: "company-1",
        customerId: "cust-1",
      }),
      false,
    );
    assert.equal(
      isCustomerLinkedSmsConversation({
        conversation: conversation({ channel_type: "email" }),
        companyId: "company-1",
        customerId: "cust-1",
      }),
      false,
    );
    assert.equal(
      isCustomerLinkedSmsConversation({
        conversation: conversation({ company_id: "company-2" }),
        companyId: "company-1",
        customerId: "cust-1",
      }),
      false,
    );
  });

  it("authorized list uses sms channel + customerId and drops unlinked rows", async () => {
    const listed: unknown[] = [];
    const rows = await listCustomerSmsConversations({
      ctx: {
        userId: "u1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (p) => p === "sms.view",
      } satisfies ServiceContext,
      conversations: {
        listConversations: async (
          ctx: ServiceContext,
          filter: { customerId?: string; channelType?: string },
        ) => {
          listed.push({ ctxUser: ctx.userId, ...filter });
          return [
            conversation({ id: "keep" }),
            conversation({ id: "drop", customer_id: "cust-2" }),
            conversation({ id: "null-cust", customer_id: null }),
            conversation({ id: "email", channel_type: "email" }),
          ];
        },
      } as never,
      companyId: "company-1",
      customerId: "cust-1",
      smsChannelEntitled: true,
    });
    assert.deepEqual(listed, [
      {
        ctxUser: "u1",
        companyId: "company-1",
        channelType: "sms",
        customerId: "cust-1",
        limit: CUSTOMER_SMS_PAGE_SIZE,
        offset: 0,
      },
    ]);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["keep"],
    );
    assert.equal(filterCustomerSmsConversations([conversation({ id: "x" })], {
      companyId: "company-1",
      customerId: "cust-1",
    }).length, 1);
  });
});

describe("customer SMS display helpers", () => {
  it("separates sent-by (created_by) from assigned_user_id", () => {
    const actor = resolveCustomerSmsMessageActor(
      message({
        message_type: "outgoing",
        created_by: "omar",
        metadata: {},
      }),
    );
    assert.equal(actor.direction, "outgoing");
    assert.equal(actor.sentByUserId, "omar");
    assert.equal(resolveCustomerSmsDirection(conversation({ last_participant_type: "customer" })), "incoming");
    assert.equal(resolveCustomerSmsThreadPhone(conversation()), "+15551234567");
    assert.equal(normalizeCustomerSmsDeliveryStatus("undelivered"), "failed");
    assert.equal(normalizeCustomerSmsDeliveryStatus("delivered"), "delivered");
    assert.equal(customerSmsMessageSnippet("a".repeat(200)).endsWith("…"), true);
    assert.equal(
      customerSmsOpenConversationHref("abc-123"),
      "~/dashboard/sms?conversation=abc-123",
    );
  });
});

describe("customer SMS UI wiring", () => {
  it("wires tab, deep-link, and localization without a tab count badge", () => {
    const tab = readFileSync(
      join(loginAppSrc, "components/customer-workspace/tabs/workspace-sms-tab.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      join(loginAppSrc, "hooks/customer-workspace/use-customer-sms-conversations.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(loginAppSrc, "pages/dashboard/customers/customer-workspace-page.tsx"),
      "utf8",
    );
    const en = JSON.parse(
      readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"),
    ) as {
      dashboard: {
        customerWorkspace: {
          tabs: { sms: string };
          sms: { openConversation: string; emptyTitle: string; sentBy: string };
        };
      };
    };
    const ar = JSON.parse(
      readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"),
    ) as {
      dashboard: {
        customerWorkspace: {
          tabs: { sms: string };
          sms: { openConversation: string };
        };
      };
    };

    assert.match(tab, /customer-sms-open-conversation/);
    assert.doesNotMatch(tab, /smsCount|badgeCount|unreadCount/);
    assert.match(hook, /sms_channel|CUSTOMER_SMS_COMMERCIAL_FEATURE/);
    assert.match(page, /WorkspaceSmsTab/);
    assert.equal(en.dashboard.customerWorkspace.tabs.sms, "SMS");
    assert.equal(en.dashboard.customerWorkspace.sms.openConversation, "Open in SMS");
    assert.equal(en.dashboard.customerWorkspace.sms.emptyTitle, "No SMS conversations");
    assert.match(en.dashboard.customerWorkspace.sms.sentBy, /Sent by/);
    assert.ok(ar.dashboard.customerWorkspace.tabs.sms);
    assert.ok(ar.dashboard.customerWorkspace.sms.openConversation);
  });
});
