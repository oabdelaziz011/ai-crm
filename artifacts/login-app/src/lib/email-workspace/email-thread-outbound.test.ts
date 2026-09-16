import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import {
  buildEmailComposerDraftPatch,
  buildEmailThreadParticipantSnapshot,
  buildEmailWorkspaceOutboundMetadata,
  buildSafeForwardDraftFromMessage,
  parseRecipientList,
  readEmailComposerDraft,
  readConversationMessageAttachments,
} from "./email-thread-outbound.ts";
import {
  buildEmailComposerOutbound,
  buildReplyAllParticipants,
  buildReplyParticipants,
} from "@workspace/channel-platform";

function message(
  overrides: Partial<ConversationMessageRecord> & {
    metadata?: Record<string, unknown>;
  },
): ConversationMessageRecord {
  return {
    id: overrides.id ?? "m1",
    conversation_id: "c1",
    participant_id: null,
    sequence_number: overrides.sequence_number ?? 1,
    message_type: overrides.message_type ?? "incoming",
    content_type: "text",
    content: overrides.content ?? "Hello",
    metadata: overrides.metadata ?? {},
    status: "delivered",
    external_message_id: overrides.external_message_id ?? null,
    attachment_type: overrides.attachment_type ?? null,
    attachment_url: overrides.attachment_url ?? null,
    mime_type: overrides.mime_type ?? null,
    file_size: overrides.file_size ?? null,
    search_text: overrides.content ?? "Hello",
    created_at: overrides.created_at ?? "2026-01-01T10:00:00.000Z",
    created_by: null,
  };
}

const inbound = message({
  id: "in-1",
  sequence_number: 1,
  message_type: "incoming",
  content: "Need help with billing",
  external_message_id: "<inbound-1@example.com>",
  metadata: {
    from: { email: "customer@example.com", name: "Customer" },
    to: [{ email: "support@company.com" }, { email: "partner@external.com" }],
    cc: [{ email: "cc@external.com" }, { email: "customer@example.com" }],
    subject: "Need help",
    references: ["root@example.com"],
  },
});

describe("email-thread-outbound workspace helpers", () => {
  it("builds reply participants without company mailbox duplicates", () => {
    const snapshot = buildEmailThreadParticipantSnapshot({
      messages: [inbound],
      companyMailboxes: ["support@company.com"],
      externalThreadId: "root@example.com",
    });
    const reply = buildReplyParticipants(snapshot, { agentMailbox: "agent@company.com" });
    assert.deepEqual(reply.to, ["customer@example.com"]);
    assert.deepEqual(reply.cc, []);

    const replyAll = buildReplyAllParticipants(snapshot, { agentMailbox: "agent@company.com" });
    assert.deepEqual(replyAll.to, ["customer@example.com"]);
    assert.ok(!replyAll.cc.includes("customer@example.com"));
    assert.ok(!replyAll.cc.includes("support@company.com"));
    assert.ok(replyAll.cc.includes("partner@external.com"));
    assert.ok(replyAll.cc.includes("cc@external.com"));
  });

  it("builds reply outbound metadata for workspace send", () => {
    const metadata = buildEmailWorkspaceOutboundMetadata({
      mode: "reply",
      messages: [inbound],
      companyMailboxes: ["support@company.com"],
      externalThreadId: "root@example.com",
    });
    assert.equal(metadata.recipientEmail, "customer@example.com");
    assert.equal(metadata.emailSubject, "Re: Need help");
    assert.equal(metadata.emailComposerMode, "reply");
  });

  it("forward draft quotes public context and leaves To empty for caller", () => {
    const draft = buildSafeForwardDraftFromMessage(inbound);
    assert.match(draft.body, /Forwarded message/);
    assert.match(draft.body, /Need help with billing/);
    assert.doesNotMatch(draft.body, /aiRouting|reasoning|internal_note/i);

    const snapshot = buildEmailThreadParticipantSnapshot({ messages: [inbound] });
    const built = buildEmailComposerOutbound({
      mode: "forward",
      snapshot,
      subject: draft.subject,
      to: [],
    });
    assert.equal(built.recipientEmail, "");
    assert.equal(built.emailSubject, "Fwd: Need help");
    assert.equal(built.inReplyTo, undefined);
  });

  it("reads and patches emailComposerDraft without dropping sibling metadata", () => {
    const current = {
      routing: { category: "billing" },
      emailComposerDraft: {
        mode: "reply",
        to: ["customer@example.com"],
        cc: [],
        bcc: [],
        subject: "Re: Need help",
        body: "Thanks",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    };
    const draft = readEmailComposerDraft(current);
    assert.ok(draft);
    assert.equal(draft?.body, "Thanks");

    const cleared = buildEmailComposerDraftPatch(current, null);
    assert.equal(cleared.emailComposerDraft, undefined);
    assert.deepEqual(cleared.routing, { category: "billing" });

    const written = buildEmailComposerDraftPatch(current, {
      mode: "reply_all",
      to: ["customer@example.com"],
      cc: ["partner@external.com"],
      bcc: [],
      subject: "Re: Need help",
      body: "Updated",
      updatedAt: "2026-01-03T00:00:00.000Z",
      attachments: [
        {
          id: "att-1",
          name: "quote.pdf",
          storagePath: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-1-quote.pdf",
          mimeType: "application/pdf",
          fileSize: 1200,
          kind: "pdf",
        },
      ],
    });
    assert.equal((written.emailComposerDraft as { body: string }).body, "Updated");
    assert.equal(
      ((written.emailComposerDraft as { attachments: Array<{ name: string }> }).attachments[0]?.name),
      "quote.pdf",
    );
    assert.deepEqual(written.routing, { category: "billing" });
  });

  it("ignores path-traversal attachment refs when reading drafts", () => {
    const draft = readEmailComposerDraft({
      emailComposerDraft: {
        mode: "reply",
        to: ["a@b.com"],
        cc: [],
        bcc: [],
        subject: "Hi",
        body: "Body",
        updatedAt: "2026-01-01T00:00:00.000Z",
        attachments: [
          {
            id: "bad",
            name: "x.txt",
            storagePath: "../other-company/secret.txt",
            mimeType: "text/plain",
            fileSize: 1,
            kind: "txt",
          },
          {
            id: "ok",
            name: "ok.txt",
            storagePath: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/ok.txt",
            mimeType: "text/plain",
            fileSize: 4,
            kind: "txt",
          },
        ],
      },
    });
    assert.equal(draft?.attachments.length, 1);
    assert.equal(draft?.attachments[0]?.name, "ok.txt");
  });

  it("readConversationMessageAttachments prefers metadata array over legacy attachment_url", () => {
    const withMeta = message({
      attachment_url: "https://legacy.example/expired",
      metadata: {
        attachments: [
          {
            id: "a1",
            name: "invoice.pdf",
            storagePath: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/a1-invoice.pdf",
            mimeType: "application/pdf",
            fileSize: 2048,
          },
        ],
      },
    });
    const views = readConversationMessageAttachments(withMeta);
    assert.equal(views.length, 1);
    assert.equal(views[0]?.name, "invoice.pdf");
    assert.equal(views[0]?.url, null);
    assert.ok(views[0]?.storagePath);

    const inboundNamed = message({
      metadata: {
        attachments: [
          {
            attachmentId: "imap-12-1",
            filename: "photo.png",
            mimeType: "image/png",
            metadata: { sizeBytes: 640, storagePath: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/a-photo.png" },
          },
        ],
      },
    });
    const inboundViews = readConversationMessageAttachments(inboundNamed);
    assert.equal(inboundViews.length, 1);
    assert.equal(inboundViews[0]?.name, "photo.png");
    assert.equal(inboundViews[0]?.fileSize, 640);
    assert.ok(inboundViews[0]?.storagePath);

    const legacy = message({
      attachment_url: "https://legacy.example/file.png",
      attachment_type: "image",
      mime_type: "image/png",
      file_size: 10,
    });
    const fallback = readConversationMessageAttachments(legacy);
    assert.equal(fallback.length, 1);
    assert.equal(fallback[0]?.url, "https://legacy.example/file.png");
  });

  it("builds compose outbound metadata without In-Reply-To or References", () => {
    const metadata = buildEmailWorkspaceOutboundMetadata({
      mode: "compose",
      messages: [],
      to: ["prospect@example.com"],
      subject: "Hello",
    });
    assert.equal(metadata.recipientEmail, "prospect@example.com");
    assert.equal(metadata.emailSubject, "Hello");
    assert.equal(metadata.emailComposerMode, "compose");
    assert.equal(metadata.inReplyTo, undefined);
    assert.equal(metadata.emailReferences, undefined);
  });

  it("parseRecipientList splits and trims without inventing addresses", () => {
    assert.deepEqual(parseRecipientList("a@x.com, b@y.com;c@z.com"), [
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    assert.deepEqual(parseRecipientList("  "), []);
  });
});
