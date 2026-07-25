import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConversationMessageView } from "./parse-conversation-message-view.js";
import type { ConversationMessageRecord } from "../types.js";

function baseMessage(overrides: Partial<ConversationMessageRecord>): ConversationMessageRecord {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    participant_id: null,
    sequence_number: 1,
    message_type: "outgoing",
    content_type: "text",
    content: "Hello",
    metadata: {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "",
    created_at: "2026-07-24T18:00:00.000Z",
    created_by: null,
    ...overrides,
  };
}

describe("parseConversationMessageView", () => {
  it("parses plain text outgoing without outboundPayload", () => {
    const view = parseConversationMessageView(
      baseMessage({ message_type: "outgoing", content: "Plain reply" }),
    );
    assert.deepEqual(view, { kind: "text", text: "Plain reply" });
  });

  it("parses buttons outbound from metadata.outboundPayload", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: "please press on what you want",
        metadata: {
          outboundPayload: {
            kind: "buttons",
            text: "please press on what you want",
            buttons: [
              { id: "book", label: "Book Appointment" },
              { id: "pricing", label: "Pricing" },
            ],
          },
        },
      }),
    );

    assert.equal(view.kind, "buttons");
    if (view.kind !== "buttons") return;
    assert.equal(view.text, "please press on what you want");
    assert.equal(view.buttons.length, 2);
    assert.equal(view.buttons[0]?.id, "book");
  });

  it("parses list outbound from metadata.outboundPayload", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: "Pick the option that fits you best.",
        metadata: {
          outboundPayload: {
            kind: "list",
            title: "Choose a doctor",
            body: "Pick the option that fits you best.",
            buttonLabel: "View options",
            sections: [
              {
                title: "Options",
                rows: [{ id: "dr3", title: "dr3", description: "Specialist" }],
              },
            ],
          },
        },
      }),
    );

    assert.equal(view.kind, "list");
    if (view.kind !== "list") return;
    assert.equal(view.title, "Choose a doctor");
    assert.equal(view.body, "Pick the option that fits you best.");
    assert.equal(view.buttonLabel, "View options");
    assert.equal(view.sections[0]?.rows[0]?.id, "dr3");
  });

  it("parses media outbound from outboundPayload", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: "Logo",
        metadata: {
          outboundPayload: {
            kind: "image",
            url: "https://example.com/logo.png",
            caption: "Logo",
            mediaType: "image",
          },
        },
      }),
    );

    assert.equal(view.kind, "media");
    if (view.kind !== "media") return;
    assert.equal(view.url, "https://example.com/logo.png");
    assert.equal(view.caption, "Logo");
  });

  it("parses template outbound from outboundPayload", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: " ",
        metadata: {
          outboundPayload: {
            kind: "template",
            templateKey: "welcome_message",
            language: "en_US",
            variables: { name: "Alex" },
          },
        },
      }),
    );

    assert.equal(view.kind, "template");
    if (view.kind !== "template") return;
    assert.equal(view.templateKey, "welcome_message");
    assert.equal(view.language, "en_US");
  });

  it("parses interactive inbound reply metadata", () => {
    const view = parseConversationMessageView(
      baseMessage({
        message_type: "incoming",
        content: "Pricing",
        metadata: {
          kind: "interactive_reply",
          replyId: "pricing",
          title: "Pricing",
          interactionType: "button_reply",
        },
      }),
    );

    assert.deepEqual(view, {
      kind: "interactive_reply",
      replyId: "pricing",
      title: "Pricing",
      interactionType: "button_reply",
    });
  });

  it("falls back to text for unknown outbound kinds", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: "Fallback body",
        metadata: {
          outboundPayload: {
            kind: "carousel",
            slides: [{ id: "1" }],
          },
        },
      }),
    );

    assert.equal(view.kind, "unknown");
    if (view.kind !== "unknown") return;
    assert.equal(view.text, "Fallback body");
    assert.equal(view.raw?.kind, "carousel");
  });

  it("treats automation synthetic kinds as text", () => {
    const view = parseConversationMessageView(
      baseMessage({
        content: "Prompt text",
        metadata: {
          outboundPayload: { kind: "automation_prompt", text: "Prompt text" },
        },
      }),
    );

    assert.deepEqual(view, { kind: "text", text: "Prompt text" });
  });
});
