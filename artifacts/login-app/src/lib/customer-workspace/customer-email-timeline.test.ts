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
  canViewCustomerEmailTab,
  customerEmailIdentityMatches,
  customerEmailMessageSnippet,
  customerEmailOpenConversationHref,
  CUSTOMER_EMAIL_PAGE_SIZE,
  CUSTOMER_EMAIL_VIEW_PERMISSION,
  filterCustomerEmailConversations,
  isCustomerLinkedEmailConversation,
  listCustomerEmailConversations,
  resolveCustomerEmailDirection,
  resolveCustomerEmailMessageActor,
} from "./customer-email-timeline.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(__dirname, "../..");

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
    external_thread_id: overrides.external_thread_id ?? "thread-1",
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

describe("customer email identity matching", () => {
  it("matches inbound sender and outbound recipient with normalized email", () => {
    assert.equal(
      customerEmailIdentityMatches({
        customerEmail: "  Asmaa@Example.com ",
        candidateEmail: "asmaa@example.com",
      }),
      true,
    );
    assert.equal(
      customerEmailIdentityMatches({
        customerEmail: "asmaa@example.com",
        candidateEmail: "asmaa@example.com",
      }),
      true,
    );
  });

  it("does not fuzzy-match name, subject, or nearby addresses", () => {
    assert.equal(
      customerEmailIdentityMatches({
        customerEmail: "asmaa@example.com",
        candidateEmail: "asmaa.galal@example.com",
      }),
      false,
    );
    assert.equal(
      customerEmailIdentityMatches({
        customerEmail: "Asmaa Galal",
        candidateEmail: "asmaa@example.com",
      }),
      false,
    );
    assert.equal(
      customerEmailIdentityMatches({
        customerEmail: "asmaa@example.com",
        candidateEmail: "Re: Delivery Status",
      }),
      false,
    );
  });

  it("unmatched email does not appear as a customer-linked conversation", () => {
    const rows = [
      conversation({ id: "linked", customer_id: "cust-1" }),
      conversation({ id: "other-customer", customer_id: "cust-2" }),
      conversation({ id: "unlinked", customer_id: null }),
      conversation({ id: "whatsapp", channel_type: "whatsapp", customer_id: "cust-1" }),
      conversation({ id: "other-company", company_id: "company-2", customer_id: "cust-1" }),
    ];
    const visible = filterCustomerEmailConversations(rows, {
      companyId: "company-1",
      customerId: "cust-1",
    });
    assert.deepEqual(
      visible.map((row) => row.id),
      ["linked"],
    );
    assert.equal(
      isCustomerLinkedEmailConversation({
        conversation: conversation({ customer_id: null }),
        companyId: "company-1",
        customerId: "cust-1",
      }),
      false,
    );
  });
});

describe("customer email permission gate", () => {
  it("CRM-only users cannot view the Email tab or fetch", () => {
    assert.equal(CUSTOMER_EMAIL_VIEW_PERMISSION, "email.view");
    assert.equal(
      canViewCustomerEmailTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "customers.view",
      }),
      false,
    );
    assert.equal(
      canViewCustomerEmailTab({
        isSuperAdmin: false,
        hasPermission: (p) => p === "email.view",
      }),
      true,
    );
    assert.equal(
      canViewCustomerEmailTab({
        isSuperAdmin: true,
        hasPermission: () => false,
      }),
      true,
    );
  });

  it("unauthorized listCustomerEmailConversations rejects before querying", async () => {
    let listed = false;
    await assert.rejects(
      () =>
        listCustomerEmailConversations({
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
        }),
      PermissionDeniedError,
    );
    assert.equal(listed, false);
  });

  it("authorized list uses email channel + customerId and keeps only linked rows", async () => {
    const listed: unknown[] = [];
    const rows = await listCustomerEmailConversations({
      ctx: {
        userId: "u1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (p) => p === "email.view",
      } satisfies ServiceContext,
      conversations: {
        listConversations: async (ctx: ServiceContext, filter: { customerId?: string; channelType?: string }) => {
          listed.push({ ctxUser: ctx.userId, ...filter });
          return [
            conversation({ id: "keep" }),
            conversation({ id: "drop", customer_id: "cust-2" }),
          ];
        },
      } as never,
      companyId: "company-1",
      customerId: "cust-1",
    });
    assert.deepEqual(listed, [
      { ctxUser: "u1", companyId: "company-1", channelType: "email", customerId: "cust-1", limit: CUSTOMER_EMAIL_PAGE_SIZE, offset: 0 },
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["keep"],
    );
  });
});

describe("customer email actor vs assignee", () => {
  it("inbound/outbound direction comes from last_participant_type", () => {
    assert.equal(resolveCustomerEmailDirection(conversation({ last_participant_type: "customer" })), "incoming");
    assert.equal(resolveCustomerEmailDirection(conversation({ last_participant_type: "employee" })), "outgoing");
  });

  it("outbound sent-by uses created_by / agentUserId, never assigned_user_id", () => {
    const assignedOnly = resolveCustomerEmailMessageActor(
      message({
        message_type: "outgoing",
        created_by: null,
        metadata: {},
      }),
    );
    assert.equal(assignedOnly.sentByUserId, null);

    const byCreated = resolveCustomerEmailMessageActor(
      message({
        message_type: "outgoing",
        created_by: "user-omar",
        metadata: {},
      }),
    );
    assert.equal(byCreated.direction, "outgoing");
    assert.equal(byCreated.sentByUserId, "user-omar");

    const byAgent = resolveCustomerEmailMessageActor(
      message({
        message_type: "outgoing",
        created_by: "user-other",
        metadata: { agentUserId: "user-omar" },
      }),
    );
    assert.equal(byAgent.sentByUserId, "user-omar");

    const inbound = resolveCustomerEmailMessageActor(
      message({
        message_type: "incoming",
        created_by: "user-omar",
        metadata: { agentUserId: "user-omar" },
      }),
    );
    assert.equal(inbound.direction, "incoming");
    assert.equal(inbound.sentByUserId, null);
  });

  it("thread messages stay grouped; snippet does not copy full HTML bodies into CRM", () => {
    assert.equal(customerEmailMessageSnippet("short"), "short");
    assert.match(customerEmailMessageSnippet("x".repeat(200)), /…$/);
    assert.equal(customerEmailOpenConversationHref("abc-123"), "~/dashboard/email?conversation=abc-123");
  });
});

describe("customer email UI + realtime wiring", () => {
  it("Email tab is hidden without permission and does not mark threads read", () => {
    const tab = readFileSync(
      join(loginAppSrc, "components/customer-workspace/tabs/workspace-email-tab.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      join(loginAppSrc, "hooks/customer-workspace/use-customer-email-conversations.ts"),
      "utf8",
    );
    const timeline = readFileSync(join(__dirname, "customer-email-timeline.ts"), "utf8");
    const access = readFileSync(
      join(loginAppSrc, "lib/customer-workspace/workspace-feature-access.ts"),
      "utf8",
    );
    assert.match(tab, /useCustomerEmailConversations\(canView \? customer.id : null\)/);
    assert.match(tab, /customer-email-open-conversation/);
    assert.doesNotMatch(tab, /resetEmployeeUnread/);
    assert.match(hook, /enabled: Boolean\(companyId && id && canView\)/);
    assert.match(hook, /customerEmailConversationsQueryKey/);
    assert.match(hook, /\["conversation-messages", id\]/);
    assert.doesNotMatch(hook, /resetEmployeeUnread/);
    assert.match(timeline, /markEmployeeRead: false/);
    assert.match(timeline, /channelType: "email"/);
    assert.match(timeline, /customerId/);
    assert.doesNotMatch(timeline, /search_text/);
    assert.match(access, /tab: "email"/);
    assert.match(access, /permissionsAny: \["email.view"\]/);
    assert.match(access, /requiredModules: \["email_channel"\]/);
  });

  it("keeps EN and AR labels without raw keys", () => {
    const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"));
    assert.equal(en.dashboard.customerWorkspace.tabs.email, "Email");
    assert.equal(ar.dashboard.customerWorkspace.tabs.email, "البريد الإلكتروني");
    assert.equal(en.dashboard.customerWorkspace.email.incoming, "Incoming");
    assert.equal(ar.dashboard.customerWorkspace.email.incoming, "وارد");
    assert.equal(en.dashboard.customerWorkspace.email.outgoing, "Outgoing");
    assert.equal(ar.dashboard.customerWorkspace.email.outgoing, "صادر");
    assert.equal(en.dashboard.customerWorkspace.email.openConversation, "Open conversation");
    assert.equal(ar.dashboard.customerWorkspace.email.openConversation, "فتح المحادثة");
    assert.equal(en.dashboard.customerWorkspace.email.emptyTitle, "No email conversations");
    assert.match(en.dashboard.customerWorkspace.email.assignedTo, /Assigned to/);
    assert.match(en.dashboard.customerWorkspace.email.sentBy, /Sent by/);
    assert.notEqual(en.dashboard.customerWorkspace.email.assignedTo, en.dashboard.customerWorkspace.email.sentBy);
  });

  it("does not add an unauthorized email count/badge on the workspace page", () => {
    const page = readFileSync(
      join(loginAppSrc, "pages/dashboard/customers/customer-workspace-page.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      join(loginAppSrc, "components/customer-workspace/customer-workspace-shell.tsx"),
      "utf8",
    );
    assert.match(page, /WorkspaceEmailTab/);
    assert.match(page, /case "email"/);
    assert.doesNotMatch(page, /useCustomerEmailConversations/);
    assert.doesNotMatch(shell, /emailCount|emailsCount|badge.*email/);
  });
});
