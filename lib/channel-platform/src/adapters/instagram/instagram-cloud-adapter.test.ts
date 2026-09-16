import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../../errors.js";
import { createContext, createTestEnvironment } from "../../test-utils.js";
import { createMessengerCloudAdapter } from "../messenger/messenger-cloud-adapter.js";
import { createWhatsAppCloudAdapter } from "../whatsapp/whatsapp-cloud-adapter.js";
import { createInstagramCloudAdapter } from "./instagram-cloud-adapter.js";

const instagramCtx = {
  companyChannel: {
    id: "cc-ig-1",
    companyId: "company-1",
    channelKey: "instagram",
    displayName: "Instagram",
    isEnabled: true,
    provider: "meta",
    configuration: {},
  },
};

const messengerCtx = {
  companyChannel: {
    id: "cc-ms-1",
    companyId: "company-1",
    channelKey: "messenger",
    displayName: "Messenger",
    isEnabled: true,
    provider: "meta",
    configuration: {},
  },
};

function instagramMessagingPayload(message: Record<string, unknown>, objectType = "instagram") {
  return {
    object: objectType,
    entry: [
      {
        id: "17841435877386136",
        time: 1710000000000,
        messaging: [
          {
            sender: { id: "28312734118386048" },
            recipient: { id: "17841435877386136" },
            timestamp: 1710000000000,
            message,
          },
        ],
      },
    ],
  };
}

describe("InstagramCloudAdapter inbound mapping", () => {
  it("preserves genuine Instagram text DMs as message.text", () => {
    const adapter = createInstagramCloudAdapter();
    const payload = instagramMessagingPayload({
      mid: "mid.text-1",
      text: "مرحبا",
    });

    const envelope = adapter.parseWebhook!(instagramCtx, payload);
    assert.equal(envelope.eventType, "message.received");

    const normalized = adapter.normalizeInbound(instagramCtx, envelope.payload);
    assert.equal(normalized.text, "مرحبا");
    assert.equal(normalized.attachments.length, 0);
    assert.equal(normalized.metadata?.instagramMessageType, "text");
  });

  it("maps generic template element title, subtitle, and button titles", () => {
    const adapter = createInstagramCloudAdapter();
    const payload = instagramMessagingPayload({
      mid: "mid.template-1",
      attachments: [
        {
          type: "template",
          payload: {
            generic: {
              elements: [
                {
                  title: "Summer sale",
                  subtitle: "20% off today",
                  buttons: [{ type: "postback", title: "Shop now", payload: "SHOP" }],
                },
              ],
            },
          },
        },
      ],
    });

    const envelope = adapter.parseWebhook!(instagramCtx, payload);
    assert.equal(envelope.eventType, "message.received");

    const normalized = adapter.normalizeInbound(instagramCtx, envelope.payload);
    assert.equal(normalized.text, "Summer sale\n20% off today\nShop now");
    assert.equal(normalized.attachments.length, 0);
    assert.equal(normalized.metadata?.instagramMessageType, "template");
  });

  it("preserves media attachments that have a usable payload.url", () => {
    const adapter = createInstagramCloudAdapter();
    const payload = instagramMessagingPayload({
      mid: "mid.image-1",
      attachments: [
        {
          type: "image",
          payload: { url: "https://cdn.example/photo.jpg" },
        },
      ],
    });

    const envelope = adapter.parseWebhook!(instagramCtx, payload);
    assert.equal(envelope.eventType, "message.received");

    const normalized = adapter.normalizeInbound(instagramCtx, envelope.payload);
    assert.equal(normalized.text, "");
    assert.equal(normalized.attachments.length, 1);
    assert.equal(normalized.attachments[0]?.type, "image");
    assert.equal(normalized.attachments[0]?.url, "https://cdn.example/photo.jpg");
    assert.equal(normalized.metadata?.instagramMessageType, "image");
  });

  it("classifies empty generic templates as template, not text", () => {
    const adapter = createInstagramCloudAdapter();
    const message = {
      mid: "mid.empty-template",
      attachments: [
        {
          type: "template",
          payload: { generic: { elements: [] } },
        },
      ],
    };
    const payload = instagramMessagingPayload(message);

    const envelopes = adapter.parseWebhookEvents!(instagramCtx, payload);
    assert.equal(envelopes[0]?.eventType, "message.unsupported");

    const normalized = adapter.normalizeInbound(instagramCtx, {
      message,
      senderExternalId: "28312734118386048",
      instagramBusinessAccountId: "17841435877386136",
    });
    assert.equal(normalized.text, "");
    assert.equal(normalized.attachments.length, 0);
    assert.equal(normalized.metadata?.instagramMessageType, "template");
  });
});

describe("Instagram empty generic template webhook ACK", () => {
  it("ignores empty generic templates without throwing a validation 500", async () => {
    const env = createTestEnvironment({
      companyChannel: {
        id: "cc-ig-1",
        companyId: "company-1",
        channelKey: "instagram",
        displayName: "Instagram",
        isEnabled: true,
        provider: "meta",
        configuration: {},
      },
      adapters: [createInstagramCloudAdapter()],
    });

    const response = await env.router.routeWebhook(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "instagram",
      rawPayload: instagramMessagingPayload({
        mid: "mid.empty-template-ack",
        attachments: [
          {
            type: "template",
            payload: { generic: { elements: [] } },
          },
        ],
      }),
    });

    assert.equal(response.kind, "ignored");
    if (response.kind === "ignored") {
      assert.equal(response.reason, "unsupported_event_type:message.unsupported");
    }
    assert.equal(env.inboundEvents.length, 0);
    assert.equal(env.incomingMessages.length, 0);
  });

  it("routes genuine Instagram text DMs through the inbound pipeline", async () => {
    const env = createTestEnvironment({
      companyChannel: {
        id: "cc-ig-1",
        companyId: "company-1",
        channelKey: "instagram",
        displayName: "Instagram",
        isEnabled: true,
        provider: "meta",
        configuration: {},
      },
      adapters: [createInstagramCloudAdapter()],
    });

    const response = await env.router.routeWebhook(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "instagram",
      rawPayload: instagramMessagingPayload({
        mid: "mid.hello",
        text: "hello instagram",
      }),
    });

    assert.equal(response.kind, "inbound");
    if (response.kind === "inbound") {
      assert.equal(env.incomingMessages[0]?.content, "hello instagram");
      assert.equal(env.inboundEvents[0]?.processing_status, "processed");
    }
  });
});

describe("WhatsApp and Messenger inbound mapping remain unchanged", () => {
  it("still maps WhatsApp text from message.text.body", () => {
    const adapter = createWhatsAppCloudAdapter();
    const ctx = {
      companyChannel: {
        id: "cc-wa-1",
        companyId: "company-1",
        channelKey: "whatsapp",
        displayName: "WhatsApp",
        isEnabled: true,
        provider: "meta",
        configuration: {
          phoneNumberId: "123456789",
          credentialsSource: "company_whatsapp_settings",
        },
      },
    };

    const normalized = adapter.normalizeInbound(ctx, {
      message: {
        from: "15551234567",
        id: "wamid.inbound-1",
        timestamp: "1710000000",
        type: "text",
        text: { body: "Hello from WhatsApp" },
      },
    });

    assert.equal(normalized.text, "Hello from WhatsApp");
  });

  it("still treats Messenger empty generic templates as inbound message.received", async () => {
    const adapter = createMessengerCloudAdapter();
    const payload = instagramMessagingPayload(
      {
        mid: "mid.ms-empty-template",
        attachments: [
          {
            type: "template",
            payload: { generic: { elements: [] } },
          },
        ],
      },
      "page",
    );

    const envelope = adapter.parseWebhook!(messengerCtx, payload);
    assert.equal(envelope.eventType, "message.received");

    const normalized = adapter.normalizeInbound(messengerCtx, envelope.payload);
    assert.equal(normalized.text, "");
    assert.equal(normalized.attachments.length, 0);

    const env = createTestEnvironment({
      companyChannel: {
        id: "cc-ms-1",
        companyId: "company-1",
        channelKey: "messenger",
        displayName: "Messenger",
        isEnabled: true,
        provider: "meta",
        configuration: {},
      },
      adapters: [createMessengerCloudAdapter()],
    });

    await assert.rejects(
      () =>
        env.router.routeWebhook(createContext(), {
          companyId: "company-1",
          companyChannelId: env.companyChannel.id,
          channelKey: "messenger",
          rawPayload: payload,
        }),
      (error: unknown) =>
        error instanceof ValidationError &&
        error.message === "Inbound message must include text, media, or an interactive reply.",
    );
  });
});
