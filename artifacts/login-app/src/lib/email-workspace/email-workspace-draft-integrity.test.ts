import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  buildClearStaleComposeDraftMetadata,
  buildSafeEmptyComposeShellCleanupMetadata,
  classifyEmailComposeConversationForCleanup,
  emailComposerDraftAutosaveFingerprint,
  hasActiveEmailWorkspaceDraft,
  isEphemeralEmailReplyComposerPrefill,
  isStaleComposeDraftAfterSuccessfulSend,
  isUnchangedEmailComposerDraftPersist,
  resolveEmailComposerDraftUpdatedAtForPersist,
  shouldPersistEmailComposerDraft,
} from "./email-workspace-draft-integrity.ts";
import {
  buildEmailWorkspaceListItemDisplay,
  findReusableEmptyNewEmailComposeShell,
} from "./email-workspace-list-item.ts";
import { EMAIL_COMPOSE_ORIGIN, EMAIL_COMPOSE_ORIGIN_KEY } from "./email-compose-new.ts";
import {
  EMAIL_COMPOSE_DISCARDED_KEY,
  EMAIL_COMPOSER_DRAFT_METADATA_KEY,
} from "./email-thread-outbound.ts";

const labels = { newEmail: "New Email", noSubject: "(no subject)" };

function baseConversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: "c1",
    company_id: "co1",
    conversation_number: "CNV-000003",
    company_channel_id: "ch1",
    ai_assistant_id: "a1",
    channel_type: "email",
    channel_instance_id: null,
    state: "idle",
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

function emptyComposeMeta() {
  return {
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
  };
}

describe("legacy empty shell classification + cleanup", () => {
  it("classifies empty legacy shell as safe_empty_shell", () => {
    assert.equal(
      classifyEmailComposeConversationForCleanup({
        companyId: "co1",
        conversationCompanyId: "co1",
        metadata: emptyComposeMeta(),
        inboundMessageCount: 0,
        outboundMessageCount: 0,
      }),
      "safe_empty_shell",
    );
  });

  it("never deletes legitimate conversations with messages", () => {
    assert.equal(
      classifyEmailComposeConversationForCleanup({
        companyId: "co1",
        conversationCompanyId: "co1",
        metadata: emptyComposeMeta(),
        inboundMessageCount: 1,
        outboundMessageCount: 0,
      }),
      "legitimate",
    );
  });

  it("never deletes contentful drafts or customer-linked threads", () => {
    assert.equal(
      classifyEmailComposeConversationForCleanup({
        companyId: "co1",
        conversationCompanyId: "co1",
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
        inboundMessageCount: 0,
        outboundMessageCount: 0,
      }),
      "legitimate",
    );
    assert.equal(
      classifyEmailComposeConversationForCleanup({
        companyId: "co1",
        conversationCompanyId: "co1",
        metadata: emptyComposeMeta(),
        customerId: "cust-1",
        inboundMessageCount: 0,
        outboundMessageCount: 0,
      }),
      "legitimate",
    );
  });

  it("marks ambiguous cross-company rows as ambiguous", () => {
    assert.equal(
      classifyEmailComposeConversationForCleanup({
        companyId: "co1",
        conversationCompanyId: "other",
        metadata: emptyComposeMeta(),
        inboundMessageCount: 0,
        outboundMessageCount: 0,
      }),
      "ambiguous",
    );
  });

  it("empty shell cleanup metadata is idempotent", () => {
    const first = buildSafeEmptyComposeShellCleanupMetadata(emptyComposeMeta());
    assert.equal(first[EMAIL_COMPOSE_DISCARDED_KEY], true);
    assert.equal(first[EMAIL_COMPOSER_DRAFT_METADATA_KEY], undefined);
    const second = buildSafeEmptyComposeShellCleanupMetadata(first);
    assert.equal(second[EMAIL_COMPOSE_DISCARDED_KEY], true);
  });
});

describe("stale draft after successful send", () => {
  it("sent conversation with stale compose draft does not show Draft", () => {
    const conversation = baseConversation({
      conversation_number: "CNV-000012",
      last_message_at: "2026-09-11T23:07:52.193Z",
      last_message_preview: "This is a controlled outbound email health test from ValueOR.",
      last_participant_type: "employee",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        subject: "ValueOR Outbound Health E2E",
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: ["outbound.health.e2e@valueor-test.local"],
          cc: [],
          bcc: [],
          subject: "ValueOR Outbound Health E2E",
          body: "",
          updatedAt: "2026-09-11T23:08:03.703Z",
          attachments: [],
        },
      },
    });
    assert.equal(
      isStaleComposeDraftAfterSuccessfulSend({
        metadata: conversation.metadata,
        outboundMessageCount: 1,
        latestOutboundStatus: "sent",
      }),
      true,
    );
    assert.equal(
      hasActiveEmailWorkspaceDraft({
        metadata: conversation.metadata,
        hasSuccessfulOutbound: true,
        latestOutboundStatus: "sent",
      }),
      false,
    );
    const item = buildEmailWorkspaceListItemDisplay({
      conversation,
      companyId: "co1",
      labels,
    });
    assert.equal(item.status, "sent");
    assert.equal(item.hasContentfulDraft, false);
  });

  it("real unsent draft still shows Draft", () => {
    const conversation = baseConversation({
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: "Still drafting",
          body: "Not sent yet",
          updatedAt: "2026-09-12T01:00:00.000Z",
          attachments: [],
        },
      },
    });
    const item = buildEmailWorkspaceListItemDisplay({
      conversation,
      companyId: "co1",
      labels,
    });
    assert.equal(item.status, "draft");
  });

  it("sending state wins over draft", () => {
    assert.equal(
      buildEmailWorkspaceListItemDisplay({
        conversation: baseConversation({
          metadata: {
            [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
              mode: "compose",
              to: ["a@b.com"],
              cc: [],
              bcc: [],
              subject: "x",
              body: "y",
              updatedAt: "2026-09-12T01:00:00.000Z",
              attachments: [],
            },
          },
        }),
        companyId: "co1",
        labels,
        isSending: true,
      }).status,
      "sending",
    );
  });

  it("failed outbound keeps draft active", () => {
    assert.equal(
      hasActiveEmailWorkspaceDraft({
        metadata: {
          [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            mode: "compose",
            to: ["a@b.com"],
            cc: [],
            bcc: [],
            subject: "x",
            body: "y",
            updatedAt: "2026-09-12T01:00:00.000Z",
            attachments: [],
          },
        },
        outboundMessageCount: 1,
        latestOutboundStatus: "failed",
      }),
      true,
    );
  });

  it("clearing stale draft preserves compose origin and drops draft key", () => {
    const cleared = buildClearStaleComposeDraftMetadata({
      [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
      subject: "ValueOR Outbound Health E2E",
      [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
        mode: "compose",
        to: ["outbound.health.e2e@valueor-test.local"],
        cc: [],
        bcc: [],
        subject: "ValueOR Outbound Health E2E",
        body: "",
        updatedAt: "2026-09-11T23:08:03.703Z",
        attachments: [],
      },
    });
    assert.equal(cleared[EMAIL_COMPOSER_DRAFT_METADATA_KEY], undefined);
    assert.equal(cleared[EMAIL_COMPOSE_ORIGIN_KEY], EMAIL_COMPOSE_ORIGIN);
    assert.ok(typeof cleared.emailDraftClearedAfterSendAt === "string");
  });
});

describe("autosave race after successful send", () => {
  it("successful send clears draft state and blocks late autosave", () => {
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: "c1",
        sendGeneration: 2,
        scheduledGeneration: 1,
        isSending: false,
        sendStatus: "success",
      }),
      false,
    );
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: "c1",
        sendGeneration: 2,
        scheduledGeneration: 2,
        isSending: false,
        sendStatus: "idle",
      }),
      false,
    );
  });

  it("autosave cannot resurrect Draft after successful send generation bump", () => {
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: null,
        sendGeneration: 3,
        scheduledGeneration: 2,
        isSending: false,
        sendStatus: "idle",
      }),
      false,
    );
  });

  it("normal draft autosave remains allowed", () => {
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: null,
        sendGeneration: 1,
        scheduledGeneration: 1,
        isSending: false,
        sendStatus: "idle",
      }),
      true,
    );
  });
});

describe("new email reuse still holds", () => {
  it("repeated New Email still reuses one empty shell", () => {
    const shells = [
      baseConversation({ id: "old", conversation_number: "CNV-000003", metadata: emptyComposeMeta() }),
      baseConversation({
        id: "new",
        conversation_number: "CNV-000009",
        updated_at: "2026-09-12T02:00:00.000Z",
        metadata: {
          ...emptyComposeMeta(),
          [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
            ...emptyComposeMeta()[EMAIL_COMPOSER_DRAFT_METADATA_KEY],
            updatedAt: "2026-09-12T02:00:00.000Z",
          },
        },
      }),
    ];
    assert.equal(findReusableEmptyNewEmailComposeShell(shells)?.id, "new");
  });

  it("intentional second contentful draft remains independent", () => {
    const contentful = baseConversation({
      id: "draft-a",
      metadata: {
        [EMAIL_COMPOSE_ORIGIN_KEY]: EMAIL_COMPOSE_ORIGIN,
        [EMAIL_COMPOSER_DRAFT_METADATA_KEY]: {
          mode: "compose",
          to: ["a@b.com"],
          cc: [],
          bcc: [],
          subject: "One",
          body: "Body",
          updatedAt: "2026-09-12T02:00:00.000Z",
          attachments: [],
        },
      },
    });
    assert.equal(findReusableEmptyNewEmailComposeShell([contentful]), null);
  });
});

describe("ephemeral reply prefill must not persist on open", () => {
  it("detects empty-body reply/reply_all as ephemeral open prefill", () => {
    assert.equal(
      isEphemeralEmailReplyComposerPrefill({
        mode: "reply",
        bodyPlain: "",
        attachmentCount: 0,
      }),
      true,
    );
    assert.equal(
      isEphemeralEmailReplyComposerPrefill({
        mode: "reply_all",
        bodyPlain: "   ",
        attachmentCount: 0,
      }),
      true,
    );
  });

  it("does not treat body edits or attachments as ephemeral", () => {
    assert.equal(
      isEphemeralEmailReplyComposerPrefill({
        mode: "reply",
        bodyPlain: "Thanks",
        attachmentCount: 0,
      }),
      false,
    );
    assert.equal(
      isEphemeralEmailReplyComposerPrefill({
        mode: "reply",
        bodyPlain: "",
        attachmentCount: 1,
      }),
      false,
    );
    assert.equal(
      isEphemeralEmailReplyComposerPrefill({
        mode: "compose",
        bodyPlain: "",
        attachmentCount: 0,
      }),
      false,
    );
  });

  it("blocks persist for ephemeral reply prefill even when generation matches", () => {
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: null,
        sendGeneration: 1,
        scheduledGeneration: 1,
        isSending: false,
        sendStatus: "idle",
        composerMode: "reply",
        bodyPlain: "",
        attachmentCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldPersistEmailComposerDraft({
        conversationId: "c1",
        suppressDraftPersistForConversationId: null,
        sendGeneration: 1,
        scheduledGeneration: 1,
        isSending: false,
        sendStatus: "idle",
        composerMode: "reply",
        bodyPlain: "Real reply body",
        attachmentCount: 0,
      }),
      true,
    );
  });

  it("identical fingerprints skip autosave (mark-read selected identity churn)", () => {
    const a = emailComposerDraftAutosaveFingerprint({
      mode: "reply",
      to: ["a@b.com"],
      cc: [],
      bcc: [],
      subject: "Re: Hello",
      bodyPlain: "",
      attachmentIds: [],
    });
    const b = emailComposerDraftAutosaveFingerprint({
      mode: "reply",
      to: ["a@b.com"],
      cc: [],
      bcc: [],
      subject: "Re: Hello",
      bodyPlain: "",
      attachmentIds: [],
    });
    assert.equal(a, b);
  });

  it("unchanged draft persist preserves updatedAt and skips write", () => {
    const previous = {
      mode: "compose" as const,
      to: ["a@b.com"],
      cc: [],
      bcc: [],
      subject: "Hello",
      body: "Working draft",
      bodyHtml: "<p>Working draft</p>",
      updatedAt: "2026-09-11T10:00:00.000Z",
      attachments: [],
    };
    const next = {
      mode: "compose" as const,
      to: ["a@b.com"],
      cc: [],
      bcc: [],
      subject: "Hello",
      body: "Working draft",
      bodyHtml: "<p>Working draft</p>",
      attachments: [],
    };
    assert.equal(
      isUnchangedEmailComposerDraftPersist({ previousDraft: previous, nextDraft: next }),
      true,
    );
    assert.equal(
      resolveEmailComposerDraftUpdatedAtForPersist({
        previousDraft: previous,
        nextDraft: next,
        nowIso: "2026-09-13T23:59:59.000Z",
      }),
      "2026-09-11T10:00:00.000Z",
    );
    assert.equal(
      resolveEmailComposerDraftUpdatedAtForPersist({
        previousDraft: previous,
        nextDraft: { ...next, body: "Edited body", bodyHtml: "<p>Edited body</p>" },
        nowIso: "2026-09-13T23:59:59.000Z",
      }),
      "2026-09-13T23:59:59.000Z",
    );
  });

  it("reply open-prefill metadata is not an active Pending draft", () => {
    assert.equal(
      hasActiveEmailWorkspaceDraft({
        metadata: {
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
        },
      }),
      false,
    );
  });
});
