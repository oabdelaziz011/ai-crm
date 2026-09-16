import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstagramCloudAdapter } from "./instagram-cloud-adapter.js";
import { formatInstagramInteractiveOutbound } from "./instagram-interactive-outbound.js";

const ctx = {
  companyChannel: {
    id: "cc-ig-1",
    companyId: "company-1",
    channelKey: "instagram",
    displayName: "Instagram",
    isEnabled: true,
    provider: "meta",
    configuration: {
      instagramBusinessAccountId: "17841400000000000",
    },
  },
};

describe("Instagram interactive outbound", () => {
  it("maps a gender send_list payload to Instagram quick replies", () => {
    const formatted = formatInstagramInteractiveOutbound({
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "igsid-1",
      text: "ما هو النوع؟",
      metadata: {
        outboundPayload: {
          kind: "list",
          title: "النوع",
          body: "ما هو النوع؟",
          buttonLabel: "اختيار",
          sections: [
            {
              title: "Gender",
              rows: [
                { id: "male", title: "ذكر" },
                { id: "female", title: "أنثى" },
              ],
            },
          ],
        },
      },
    });

    assert.ok(formatted);
    assert.equal(formatted.message.text, "ما هو النوع؟");
    assert.deepEqual(formatted.message.quick_replies, [
      { content_type: "text", title: "ذكر", payload: "male" },
      { content_type: "text", title: "أنثى", payload: "female" },
    ]);
    assert.equal(formatted.message.attachment, undefined);
  });

  it("maps send_buttons to a generic template with postbacks", () => {
    const formatted = formatInstagramInteractiveOutbound({
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "igsid-1",
      text: "Choose",
      metadata: {
        outboundPayload: {
          kind: "buttons",
          text: "Choose an option",
          buttons: [
            { id: "book", label: "Book now" },
            { id: "later", label: "Later" },
          ],
        },
      },
    });

    assert.ok(formatted);
    const attachment = formatted.message.attachment;
    assert.equal(attachment?.type, "template");
    assert.equal(attachment?.payload.template_type, "generic");
    const buttons = (
      attachment?.payload.elements as Array<{ buttons: Array<{ type: string; payload: string; title: string }> }>
    )[0]?.buttons;
    assert.deepEqual(buttons, [
      { type: "postback", title: "Book now", payload: "book" },
      { type: "postback", title: "Later", payload: "later" },
    ]);
  });

  it("does not treat a plain text message as interactive", () => {
    const formatted = formatInstagramInteractiveOutbound({
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "igsid-1",
      text: "Hello",
    });
    assert.equal(formatted, null);
  });
});

describe("InstagramCloudAdapter interactive list", () => {
  it("formats gender lists as quick replies instead of WhatsApp interactive lists", () => {
    const adapter = createInstagramCloudAdapter();
    const formatted = adapter.formatOutbound(ctx, {
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "igsid-1",
      text: "What is your gender?",
      metadata: {
        outboundPayload: {
          kind: "list",
          title: "Gender",
          body: "What is your gender?",
          buttonLabel: "Select",
          sections: [
            {
              title: "Gender",
              rows: [
                { id: "male", title: "Male" },
                { id: "female", title: "Female" },
              ],
            },
          ],
        },
      },
    });

    const payload = formatted.payload as {
      message: { text?: string; quick_replies?: Array<{ payload: string; title: string }> };
    };
    assert.equal(payload.message.text, "What is your gender?");
    assert.equal(payload.message.quick_replies?.length, 2);
    assert.equal(payload.message.quick_replies?.[0]?.payload, "male");
    assert.doesNotMatch(JSON.stringify(formatted), /"type":"list"/);
  });

  it("normalizes a tapped quick reply as a list interactive selection", () => {
    const adapter = createInstagramCloudAdapter();
    const normalized = adapter.normalizeInbound(ctx, {
      senderExternalId: "igsid-1",
      instagramBusinessAccountId: "17841400000000000",
      message: {
        mid: "mid.gender-1",
        text: "Male",
        quick_reply: { payload: "male" },
      },
    });

    assert.equal(normalized.text, "Male");
    assert.equal(normalized.metadata?.kind, "interactive_reply");
    assert.equal(normalized.metadata?.interactionType, "list_reply");
    assert.equal(normalized.metadata?.replyId, "male");
    assert.equal(normalized.metadata?.title, "Male");
  });

  it("still formats a plain text reply as text-only", () => {
    const adapter = createInstagramCloudAdapter();
    const formatted = adapter.formatOutbound(ctx, {
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "igsid-1",
      text: "Welcome",
    });
    const payload = formatted.payload as { message: { text?: string; quick_replies?: unknown } };
    assert.equal(payload.message.text, "Welcome");
    assert.equal(payload.message.quick_replies, undefined);
  });
});
