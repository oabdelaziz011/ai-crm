import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  buildEmailListPlainPreview,
  buildEmailWorkspaceListItemDisplay,
  classifyEmailWorkspaceListBucket,
  deriveEmailWorkspaceListStatus,
  findReusableEmptyNewEmailComposeShell,
  formatEmailListTemplateDisplay,
  isEmailWorkspaceInboxConversation,
  isEmailWorkspacePendingConversation,
  isReusableEmptyNewEmailComposeShell,
  resolveEmailWorkspaceListSortAt,
  sortEmailWorkspaceConversations,
} from "./email-workspace-list-item.ts";
import { EMAIL_COMPOSE_ORIGIN, EMAIL_COMPOSE_ORIGIN_KEY } from "./email-compose-new.ts";
import { EMAIL_COMPOSER_DRAFT_METADATA_KEY } from "./email-thread-outbound.ts";
import { conversationHasSuccessfulEmailOutbound } from "./email-workspace-metric-filter.ts";

const labels = { newEmail: "New Email", noSubject: "(no subject)" };

function baseConversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "c1",
    company_id: "co1",
    conversation_number: "CNV-000313",
    company_channel_id: "ch1",
    ai_assistant_id: "a1",
    channel_type: "email",
    channel_instance_id: null,
    state: "open",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: null,
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
    started_at: "2026-09-12T00:00:00.000Z",
    ended_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

describe("email workspace list presentation", () => {
  it("uses customer name as primary identity", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({ customer_id: "cust1", conversation_number: "CNV-000313" }),
      companyId: "co1",
      customer: { id: "cust1", companyId: "co1", name: "Ahmed Mohamed", email: "a@x.com" },
      labels,
    });
    assert.equal(item.primary, "Ahmed Mohamed");
    assert.equal(item.primaryIsEmail, false);
    assert.notEqual(item.primary, "CNV-000313");
    assert.equal(item.lastDirection, null);
  });

  it("surfaces lastDirection from last_participant_type without changing identity", () => {
    const incoming = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({ last_participant_type: "customer" }),
      companyId: "co1",
      labels,
    });
    const outgoing = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({ last_participant_type: "employee" }),
      companyId: "co1",
      labels,
    });
    assert.equal(incoming.lastDirection, "incoming");
    assert.equal(outgoing.lastDirection, "outgoing");
  });

  it("falls back to recipient email when no customer", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        metadata: {
          [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["abdelazizomar187@gmail.com"],
            cc: [],
            bcc: [],
            subject: "Welcome to ValueOR",
            body: "This is a controlled test",
            updatedAt: "2026-09-12T01:36:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      labels,
    });
    assert.equal(item.primary, "abdelazizomar187@gmail.com");
    assert.equal(item.primaryIsEmail, true);
    assert.equal(item.subject, "Welcome to ValueOR");
    assert.match(item.preview ?? "", /controlled test/i);
    assert.equal(item.status, "draft");
  });

  it("shows subject and body preview for drafts", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        metadata: {
          subject: "Hello team",
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["a@b.com"],
            cc: [],
            bcc: [],
            subject: "Hello team",
            body: "Body line",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      labels,
    });
    assert.equal(item.subject, "Hello team");
    assert.equal(item.preview, "Body line");
    assert.equal(item.showNoPreview, false);
  });

  it("falls back preview to subject when body empty", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        metadata: {
          subject: "Only subject",
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["a@b.com"],
            cc: [],
            bcc: [],
            subject: "Only subject",
            body: "",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      labels,
    });
    assert.equal(item.preview, "Only subject");
    assert.equal(item.showNoPreview, false);
  });

  it("marks showNoPreview only when subject and body are empty", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        metadata: {
          [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: [],
            cc: [],
            bcc: [],
            subject: "",
            body: "",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      labels,
    });
    assert.equal(item.showNoPreview, true);
    assert.equal(item.preview, null);
  });

  it("strips HTML tags from preview", () => {
    const preview = buildEmailListPlainPreview({
      html: "<strong>Hello Ahmed</strong><br/>Thanks for contacting us.",
    });
    assert.equal(preview.includes("<strong>"), false);
    assert.match(preview, /Hello Ahmed/);
    assert.match(preview, /Thanks for contacting us/);
  });

  it("truncates long previews", () => {
    const preview = buildEmailListPlainPreview({
      plain: "x".repeat(200),
      maxLength: 40,
    });
    assert.ok(preview.length <= 40);
    assert.ok(preview.endsWith("…"));
  });

  it("preserves Arabic preview text", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        metadata: {
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["a@b.com"],
            cc: [],
            bcc: [],
            subject: "مرحبا",
            body: "مرحبًا أحمد، أهلاً وسهلاً بك في ValueOR",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      labels,
    });
    assert.equal(item.subject, "مرحبا");
    assert.match(item.preview ?? "", /أهلاً وسهلاً/);
  });

  it("preserves English preview text", () => {
    const preview = buildEmailListPlainPreview({ plain: "Hello world from ValueOR" });
    assert.equal(preview, "Hello world from ValueOR");
  });

  it("uses draft / sent / failed statuses truthfully", () => {
    assert.equal(
      deriveEmailWorkspaceListStatus({ hasContentfulDraft: true }),
      "draft",
    );
    assert.equal(
      deriveEmailWorkspaceListStatus({
        hasContentfulDraft: false,
        lastMessageAt: "2026-09-12T01:00:00.000Z",
        lastParticipantType: "employee",
      }),
      "sent",
    );
    assert.equal(
      deriveEmailWorkspaceListStatus({
        hasContentfulDraft: false,
        outboundFailure: true,
      }),
      "failed",
    );
    assert.equal(
      deriveEmailWorkspaceListStatus({
        hasContentfulDraft: true,
        isSending: true,
      }),
      "sending",
    );
  });

  it("sorts by latest activity not conversation id", () => {
    const older = baseConversation({
      id: "zzz",
      conversation_number: "CNV-000999",
      last_message_at: "2026-09-12T01:00:00.000Z",
      updated_at: "2026-09-12T01:00:00.000Z",
    });
    const newer = baseConversation({
      id: "aaa",
      conversation_number: "CNV-000001",
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: "New",
          body: "edited",
          updatedAt: "2026-09-12T02:00:00.000Z",
          attachments: [],
        },
      },
      updated_at: "2026-09-12T02:00:00.000Z",
    });
    const sorted = sortEmailWorkspaceConversations([older, newer]);
    assert.equal(sorted[0]?.id, "aaa");
  });
});

describe("email list template display safety", () => {
  it("resolves {{customer.name}} when customer exists", () => {
    const text = formatEmailListTemplateDisplay("Welcome {{customer.name}}", {
      "customer.name": "Ahmed",
    });
    assert.equal(text, "Welcome Ahmed");
    assert.equal(text.includes("{{"), false);
  });

  it("never displays raw unresolved {{customer.name}}", () => {
    const text = formatEmailListTemplateDisplay("Welcome {{customer.name}}", {});
    assert.equal(text.includes("{{"), false);
    assert.equal(text.includes("customer.name"), false);
    assert.equal(text, "Welcome");
  });

  it("handles multiple variables safely", () => {
    const text = formatEmailListTemplateDisplay(
      "Hi {{customer.name}} — {{company.name}}",
      { "customer.name": "Omar", "company.name": "ABC Travel" },
    );
    assert.equal(text, "Hi Omar — ABC Travel");
  });

  it("resolves company when customer is missing", () => {
    const text = formatEmailListTemplateDisplay(
      "Welcome {{customer.name}} from {{company.name}}",
      { "company.name": "ABC Travel" },
    );
    assert.equal(text, "Welcome from ABC Travel");
    assert.equal(text.includes("{{"), false);
  });

  it("safe fallback without customer for Arabic template", () => {
    const text = formatEmailListTemplateDisplay("مرحبًا {{customer.name}} بك في ValueOR", {});
    assert.equal(text.includes("{{"), false);
    assert.match(text, /مرحبًا/);
    assert.match(text, /ValueOR/);
  });

  it("list item applies template safety to subject and preview", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({
        customer_id: "cust1",
        metadata: {
          subject: "Welcome {{customer.name}}",
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["a@b.com"],
            cc: [],
            bcc: [],
            subject: "Welcome {{customer.name}}",
            bodyHtml: "<p>مرحبًا {{customer.name}}</p>",
            body: "مرحبًا {{customer.name}}",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
      }),
      companyId: "co1",
      customer: { id: "cust1", companyId: "co1", name: "Ahmed", email: "a@b.com" },
      labels,
    });
    assert.equal(item.subject, "Welcome Ahmed");
    assert.match(item.preview ?? "", /Ahmed/);
    assert.equal((item.subject ?? "").includes("{{"), false);
    assert.equal((item.preview ?? "").includes("{{"), false);
  });

  it("does not use cross-company customer for display", () => {
    const item = buildEmailWorkspaceListItemDisplay({
      conversation: baseConversation({ customer_id: "cust1" }),
      companyId: "co1",
      customer: { id: "cust1", companyId: "other-co", name: "Leak", email: "x@y.com" },
      labels,
    });
    assert.notEqual(item.primary, "Leak");
  });
});

describe("New Email empty shell reuse", () => {
  it("first empty compose shell is reusable", () => {
    const shell = baseConversation({
      id: "shell-1",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          updatedAt: "2026-09-12T01:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(isReusableEmptyNewEmailComposeShell(shell), true);
    assert.equal(findReusableEmptyNewEmailComposeShell([shell])?.id, "shell-1");
  });

  it("contentful draft is not treated as empty reusable shell", () => {
    const draft = baseConversation({
      id: "draft-1",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: "Hi",
          body: "Hello",
          updatedAt: "2026-09-12T01:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(isReusableEmptyNewEmailComposeShell(draft), false);
    assert.equal(findReusableEmptyNewEmailComposeShell([draft]), null);
  });

  it("prefers newest empty shell when several exist", () => {
    const older = baseConversation({
      id: "old",
      updated_at: "2026-09-12T01:00:00.000Z",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          updatedAt: "2026-09-12T01:00:00.000Z",
          attachments: [],
        },
      },
    });
    const newer = baseConversation({
      id: "new",
      updated_at: "2026-09-12T02:00:00.000Z",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          updatedAt: "2026-09-12T02:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(findReusableEmptyNewEmailComposeShell([older, newer])?.id, "new");
  });

  it("shells with messages are not reusable", () => {
    const shell = baseConversation({
      last_message_at: "2026-09-12T01:00:00.000Z",
      last_message_preview: "Sent body",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          updatedAt: "2026-09-12T01:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(isReusableEmptyNewEmailComposeShell(shell), false);
  });
});

describe("email workspace Inbox / Pending classification", () => {
  function contentfulDraft(mode: "reply" | "reply_all" | "forward" | "compose") {
    return {
      mode,
      to: ["customer@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Hello",
      body: "Working on a reply",
      bodyHtml: "<p>Working on a reply</p>",
      updatedAt: "2026-09-12T03:00:00.000Z",
      attachments: [],
    };
  }

  it("incoming email without draft stays in Inbox", () => {
    const conversation = baseConversation({
      last_message_at: "2026-09-12T01:00:00.000Z",
      last_message_preview: "Inbound hello",
      last_participant_type: "customer",
      metadata: {},
    });
    assert.equal(classifyEmailWorkspaceListBucket(conversation), "inbox");
    assert.equal(isEmailWorkspaceInboxConversation(conversation), true);
    assert.equal(isEmailWorkspacePendingConversation(conversation), false);
  });

  it("reply draft moves conversation to Pending (not Inbox)", () => {
    const conversation = baseConversation({
      last_message_at: "2026-09-12T01:00:00.000Z",
      last_message_preview: "Inbound hello",
      last_participant_type: "customer",
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: contentfulDraft("reply"),
      },
    });
    assert.equal(classifyEmailWorkspaceListBucket(conversation), "pending");
    assert.equal(isEmailWorkspaceInboxConversation(conversation), false);
    assert.equal(isEmailWorkspacePendingConversation(conversation), true);
  });

  it("reply_all and forward drafts are Pending", () => {
    for (const mode of ["reply_all", "forward"] as const) {
      const conversation = baseConversation({
        last_message_at: "2026-09-12T01:00:00.000Z",
        last_message_preview: "Inbound",
        last_participant_type: "customer",
        metadata: {
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: contentfulDraft(mode),
        },
      });
      assert.equal(classifyEmailWorkspaceListBucket(conversation), "pending", mode);
    }
  });

  it("clearing draft restores Inbox classification", () => {
    const withDraft = baseConversation({
      last_message_at: "2026-09-12T01:00:00.000Z",
      last_message_preview: "Inbound",
      last_participant_type: "customer",
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: contentfulDraft("reply"),
      },
    });
    assert.equal(classifyEmailWorkspaceListBucket(withDraft), "pending");
    const cleared = baseConversation({
      ...withDraft,
      metadata: {},
    });
    assert.equal(classifyEmailWorkspaceListBucket(cleared), "inbox");
  });

  it("compose New Email draft is Pending", () => {
    const conversation = baseConversation({
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: contentfulDraft("compose"),
      },
    });
    assert.equal(classifyEmailWorkspaceListBucket(conversation), "pending");
  });

  it("reply shell with only to+subject (open prefill) stays Inbox — not Pending", () => {
    const conversation = baseConversation({
      last_message_at: "2026-09-12T01:00:00.000Z",
      last_message_preview: "Inbound hello",
      last_participant_type: "customer",
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "reply",
          to: ["customer@example.com"],
          cc: [],
          bcc: [],
          subject: "Re: Hello",
          body: "",
          bodyHtml: "",
          updatedAt: "2026-09-12T99:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(classifyEmailWorkspaceListBucket(conversation), "inbox");
    assert.equal(isEmailWorkspaceInboxConversation(conversation), true);
  });
});

describe("Phase open-conversation list stability", () => {
  function inboxMail(id: string, lastMessageAt: string, unread = 1): ConversationRecord {
    return baseConversation({
      id,
      last_message_at: lastMessageAt,
      last_message_preview: `Preview ${id}`,
      last_participant_type: "customer",
      unread_count_employee: unread,
      updated_at: lastMessageAt,
      created_at: lastMessageAt,
      metadata: {},
    });
  }

  function sentMail(id: string, lastMessageAt: string): ConversationRecord {
    return baseConversation({
      id,
      last_message_at: lastMessageAt,
      last_message_preview: `Sent ${id}`,
      last_participant_type: "employee",
      unread_count_employee: 0,
      updated_at: lastMessageAt,
      created_at: lastMessageAt,
      metadata: {},
    });
  }

  function pendingMail(id: string, draftUpdatedAt: string, lastMessageAt: string | null): ConversationRecord {
    return baseConversation({
      id,
      last_message_at: lastMessageAt,
      last_message_preview: lastMessageAt ? `Preview ${id}` : null,
      last_participant_type: lastMessageAt ? "customer" : null,
      updated_at: draftUpdatedAt,
      created_at: lastMessageAt ?? draftUpdatedAt,
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: lastMessageAt ? "reply" : "compose",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: `Draft ${id}`,
          body: `Working draft ${id}`,
          bodyHtml: `<p>Working draft ${id}</p>`,
          updatedAt: draftUpdatedAt,
          attachments: [],
        },
        ...(lastMessageAt
          ? {}
          : { [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN }),
      },
    });
  }

  /** Simulate mark-as-read: unread cleared + updated_at bumped (postgres trigger). */
  function afterMarkRead(row: ConversationRecord, openedAt: string): ConversationRecord {
    return {
      ...row,
      unread_count_employee: 0,
      updated_at: openedAt,
      updated_by: "agent-1",
    };
  }

  it("A/D: opening Inbox conversation does not change bucket or order", () => {
    const a = inboxMail("A", "2026-09-10T10:00:00.000Z");
    const b = inboxMail("B", "2026-09-11T10:00:00.000Z");
    const c = inboxMail("C", "2026-09-12T10:00:00.000Z");
    const before = sortEmailWorkspaceConversations([a, b, c]);
    assert.deepEqual(
      before.map((row) => row.id),
      ["C", "B", "A"],
    );

    const openedB = afterMarkRead(b, "2026-09-12T23:59:59.000Z");
    // Accidental ephemeral reply prefill metadata must not reclassify or reorder.
    openedB.metadata = {
      [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
        mode: "reply",
        to: ["customer@example.com"],
        cc: [],
        bcc: [],
        subject: "Re: Hello",
        body: "",
        updatedAt: "2026-09-12T23:59:59.000Z",
        attachments: [],
      },
    };

    assert.equal(classifyEmailWorkspaceListBucket(openedB), "inbox");
    const after = sortEmailWorkspaceConversations([a, openedB, c]);
    assert.deepEqual(
      after.map((row) => row.id),
      ["C", "B", "A"],
    );
    assert.equal(resolveEmailWorkspaceListSortAt(openedB), b.last_message_at);
  });

  it("B/C: mark-read updated_at bump does not change ordering timestamp", () => {
    const row = inboxMail("B", "2026-09-11T10:00:00.000Z");
    const beforeAt = resolveEmailWorkspaceListSortAt(row);
    const after = afterMarkRead(row, "2026-09-13T00:00:00.000Z");
    assert.equal(resolveEmailWorkspaceListSortAt(after), beforeAt);
    assert.notEqual(after.updated_at, row.updated_at);
  });

  it("E: opening Sent conversation does not reorder Sent list", () => {
    const a = sentMail("A", "2026-09-10T10:00:00.000Z");
    const b = sentMail("B", "2026-09-11T10:00:00.000Z");
    const c = sentMail("C", "2026-09-12T10:00:00.000Z");
    const before = sortEmailWorkspaceConversations([a, b, c]).map((row) => row.id);
    assert.deepEqual(before, ["C", "B", "A"]);

    const openedB = afterMarkRead(b, "2026-09-13T12:00:00.000Z");
    const after = sortEmailWorkspaceConversations([a, openedB, c]).map((row) => row.id);
    assert.deepEqual(after, ["C", "B", "A"]);
    assert.equal(conversationHasSuccessfulEmailOutbound(openedB), true);
  });

  it("F: opening Pending draft does not reorder when only updated_at changes", () => {
    const a = pendingMail("A", "2026-09-10T10:00:00.000Z", null);
    const b = pendingMail("B", "2026-09-11T10:00:00.000Z", "2026-09-09T10:00:00.000Z");
    const c = pendingMail("C", "2026-09-12T10:00:00.000Z", null);
    // Message activity wins over draft.updatedAt: C (compose) > A (compose) > B (reply w/ older last_message).
    const before = sortEmailWorkspaceConversations([a, b, c]).map((row) => row.id);
    assert.deepEqual(before, ["C", "A", "B"]);

    // Mark-read / conversation touch bumps updated_at but draft.updatedAt is unchanged.
    const openedB = afterMarkRead(b, "2026-09-13T12:00:00.000Z");
    assert.equal(classifyEmailWorkspaceListBucket(openedB), "pending");
    const after = sortEmailWorkspaceConversations([a, openedB, c]).map((row) => row.id);
    assert.deepEqual(after, ["C", "A", "B"]);
    assert.equal(resolveEmailWorkspaceListSortAt(openedB), "2026-09-09T10:00:00.000Z");
  });

  it("F2: Pending reply draft.updatedAt bump must not reorder (open autosave regression)", () => {
    const a = pendingMail("A", "2026-09-10T10:00:00.000Z", "2026-09-10T10:00:00.000Z");
    const b = pendingMail("B", "2026-09-11T10:00:00.000Z", "2026-09-11T10:00:00.000Z");
    const c = pendingMail("C", "2026-09-12T10:00:00.000Z", "2026-09-12T10:00:00.000Z");
    const before = sortEmailWorkspaceConversations([a, b, c]).map((row) => row.id);
    assert.deepEqual(before, ["C", "B", "A"]);

    // Simulate open→autosave rewriting draft.updatedAt (the reproduced bug mutation).
    const openedB: ConversationRecord = {
      ...b,
      updated_at: "2026-09-13T23:59:59.000Z",
      metadata: {
        ...b.metadata,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          ...(b.metadata?.[EMAIL_COMPOSER_DRAFT_METADATA_KEY] as Record<string, unknown>),
          updatedAt: "2026-09-13T23:59:59.000Z",
        },
      },
    };
    assert.equal(classifyEmailWorkspaceListBucket(openedB), "pending");
    assert.equal(resolveEmailWorkspaceListSortAt(openedB), b.last_message_at);
    const after = sortEmailWorkspaceConversations([a, openedB, c]).map((row) => row.id);
    assert.deepEqual(after, ["C", "B", "A"]);
  });

  it("E2: Sent list ignores draft.updatedAt bump on open", () => {
    const a = sentMail("A", "2026-09-10T10:00:00.000Z");
    const b = sentMail("B", "2026-09-11T10:00:00.000Z");
    const c = sentMail("C", "2026-09-12T10:00:00.000Z");
    const openedB: ConversationRecord = {
      ...afterMarkRead(b, "2026-09-13T12:00:00.000Z"),
      metadata: {
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "reply",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: "Re: Sent B",
          body: "Continuing draft after send",
          bodyHtml: "<p>Continuing draft after send</p>",
          updatedAt: "2026-09-13T23:59:59.000Z",
          attachments: [],
        },
      },
    };
    assert.equal(conversationHasSuccessfulEmailOutbound(openedB), true);
    assert.equal(resolveEmailWorkspaceListSortAt(openedB), b.last_message_at);
    const after = sortEmailWorkspaceConversations([a, openedB, c]).map((row) => row.id);
    assert.deepEqual(after, ["C", "B", "A"]);
  });

  it("F3: Pending compose shell keeps draft.updatedAt sort key but open must not change it", () => {
    const a = pendingMail("A", "2026-09-10T10:00:00.000Z", null);
    const b = pendingMail("B", "2026-09-11T10:00:00.000Z", null);
    const c = pendingMail("C", "2026-09-12T10:00:00.000Z", null);
    const before = sortEmailWorkspaceConversations([a, b, c]).map((row) => row.id);
    assert.deepEqual(before, ["C", "B", "A"]);
    assert.equal(resolveEmailWorkspaceListSortAt(b), "2026-09-11T10:00:00.000Z");

    const openedB = afterMarkRead(b, "2026-09-13T12:00:00.000Z");
    assert.equal(resolveEmailWorkspaceListSortAt(openedB), "2026-09-11T10:00:00.000Z");
    const after = sortEmailWorkspaceConversations([a, openedB, c]).map((row) => row.id);
    assert.deepEqual(after, ["C", "B", "A"]);
  });
});
