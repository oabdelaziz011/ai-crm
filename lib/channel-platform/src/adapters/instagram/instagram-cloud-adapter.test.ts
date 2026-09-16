import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../../errors.js";
import { createContext, createTestEnvironment } from "../../test-utils.js";
import { createMessengerCloudAdapter } from "../messenger/messenger-cloud-adapter.js";
import { createWhatsAppCloudAdapter } from "../whatsapp/whatsapp-cloud-adapter.js";
import { messengerMessagesUrl } from "../messenger/messenger-config.js";
import { whatsAppMessagesUrl } from "../whatsapp/whatsapp-config.js";
import { createInstagramCloudAdapter } from "./instagram-cloud-adapter.js";
import {
  INSTAGRAM_LOGIN_GRAPH_HOST,
  instagramGraphBaseUrl,
  instagramMessagesUrl,
} from "./instagram-config.js";

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
      aiAssistantId: "assistant-1",
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

describe("Instagram Login outbound Graph host", () => {
  it("builds the Send API URL on graph.instagram.com, not Facebook Graph", () => {
    assert.equal(INSTAGRAM_LOGIN_GRAPH_HOST, "https://graph.instagram.com");
    assert.equal(instagramGraphBaseUrl("v21.0"), "https://graph.instagram.com/v21.0");
    assert.equal(instagramGraphBaseUrl("  "), "https://graph.instagram.com/v21.0");
    assert.equal(
      instagramMessagesUrl({
        instagramBusinessAccountId: "17841435877386136",
        accessToken: "IGQW-login-token",
        verifyToken: "verify",
        apiVersion: "v21.0",
      }),
      "https://graph.instagram.com/v21.0/17841435877386136/messages",
    );
    assert.doesNotMatch(instagramGraphBaseUrl("v21.0"), /graph\.facebook\.com/);
  });

  it("sends with the Instagram Login access token from company_instagram_settings", async () => {
    const requests: Array<{ url: string; authorization: string | null; body: unknown }> = [];
    const adapter = createInstagramCloudAdapter({
      fetchFn: async (url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: String(url),
          authorization: headers.get("authorization"),
          body: JSON.parse(String(init?.body ?? "{}")),
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ message_id: "mid.outbound-1" }),
        } as Response;
      },
      credentialsLoader: {
        loadByCompanyId: async () => ({
          accessToken: "IGQW-login-token",
          instagramBusinessAccountId: "17841435877386136",
          verifyToken: "verify",
          apiVersion: "v21.0",
        }),
      },
    });

    const formatted = adapter.formatOutbound(instagramCtx, {
      conversationId: "conv-1",
      companyChannelId: instagramCtx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "28312734118386048",
      text: "hello from automation",
    });

    const result = await adapter.sendOutbound(instagramCtx, formatted);
    assert.equal(result.externalMessageId, "mid.outbound-1");
    assert.equal(requests.length, 1);
    const sent = new URL(requests[0]!.url);
    assert.equal(sent.origin, "https://graph.instagram.com");
    assert.equal(sent.pathname, "/v21.0/17841435877386136/messages");
    assert.equal(sent.searchParams.get("access_token"), "IGQW-login-token");
    assert.equal(requests[0]?.authorization, "Bearer IGQW-login-token");
    assert.equal(
      (requests[0]?.body as { recipient: { id: string }; message: { text: string } }).recipient.id,
      "28312734118386048",
    );
    assert.doesNotMatch(requests[0]?.url ?? "", /graph\.facebook\.com/);
  });

  it("maps Instagram buttons outbound to tappable quick replies", () => {
    const adapter = createInstagramCloudAdapter();
    const formatted = adapter.formatOutbound(instagramCtx, {
      conversationId: "conv-1",
      companyChannelId: instagramCtx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "28312734118386048",
      text: "تحب تسألي عن حاجة تانية، ولا خلاص؟",
      metadata: {
        outboundPayload: {
          kind: "buttons",
          text: "تحب تسألي عن حاجة تانية، ولا خلاص؟",
          buttons: [
            { id: "something_else", label: "حاجة تانية" },
            { id: "no", label: "خلاص، شكراً" },
          ],
        },
      },
    });

    const payload = formatted.payload as {
      message: {
        text: string;
        quick_replies?: Array<{ content_type: string; title: string; payload: string }>;
      };
    };
    assert.equal(payload.message.text, "تحب تسألي عن حاجة تانية، ولا خلاص؟");
    assert.deepEqual(payload.message.quick_replies, [
      { content_type: "text", title: "حاجة تانية", payload: "something_else" },
      { content_type: "text", title: "خلاص، شكراً", payload: "no" },
    ]);
  });

  it("maps Instagram pricing lists to tappable quick replies instead of body-only text", () => {
    const adapter = createInstagramCloudAdapter();
    const formatted = adapter.formatOutbound(instagramCtx, {
      conversationId: "conv-1",
      companyChannelId: instagramCtx.companyChannel.id,
      channelKey: "instagram",
      externalThreadId: "28312734118386048",
      text: "اختَر الخيار الأنسب لك.",
      metadata: {
        outboundPayload: {
          kind: "list",
          title: "اختر خدمة",
          body: "اختَر الخيار الأنسب لك.",
          buttonLabel: "عرض الخيارات",
          sections: [
            {
              title: "خدمات",
              rows: [
                { id: "a1b2c3d4-1111-4111-8111-111111111111", title: "عياده اسنان" },
                { id: "a1b2c3d4-2222-4222-8222-222222222222", title: "عياده اطفال" },
                { id: "a1b2c3d4-3333-4333-8333-333333333333", title: "عياده باطنة" },
              ],
            },
          ],
        },
      },
    });

    const payload = formatted.payload as {
      message: {
        text: string;
        quick_replies?: Array<{ content_type: string; title: string; payload: string }>;
      };
    };
    assert.equal(payload.message.text, "اختَر الخيار الأنسب لك.");
    assert.equal(payload.message.quick_replies?.length, 3);
    assert.deepEqual(
      payload.message.quick_replies?.map((reply) => reply.title),
      ["عياده اسنان", "عياده اطفال", "عياده باطنة"],
    );
    assert.equal(
      payload.message.quick_replies?.[0]?.payload,
      "a1b2c3d4-1111-4111-8111-111111111111",
    );
    assert.equal(payload.message.quick_replies?.[0]?.content_type, "text");
  });

  it("maps inbound Instagram quick replies to interactive reply ids", () => {
    const adapter = createInstagramCloudAdapter();
    const payload = instagramMessagingPayload({
      mid: "mid.qr-1",
      text: "حاجة تانية",
      quick_reply: { payload: "something_else", title: "حاجة تانية" },
    });
    const envelope = adapter.parseWebhook!(instagramCtx, payload);
    const normalized = adapter.normalizeInbound(instagramCtx, envelope.payload);
    assert.equal(normalized.metadata?.kind, "interactive_reply");
    assert.equal(normalized.metadata?.replyId, "something_else");
    assert.equal(normalized.metadata?.interactionType, "quick_reply");
  });

  it("maps inbound Instagram pricing list taps onto the selected row id", () => {
    const adapter = createInstagramCloudAdapter();
    const payload = instagramMessagingPayload({
      mid: "mid.qr-service",
      text: "عياده اسنان",
      quick_reply: {
        payload: "a1b2c3d4-1111-4111-8111-111111111111",
        title: "عياده اسنان",
      },
    });
    const envelope = adapter.parseWebhook!(instagramCtx, payload);
    const normalized = adapter.normalizeInbound(instagramCtx, envelope.payload);
    assert.equal(envelope.eventType, "message.received");
    assert.equal(normalized.text, "عياده اسنان");
    assert.equal(normalized.metadata?.kind, "interactive_reply");
    assert.equal(normalized.metadata?.replyId, "a1b2c3d4-1111-4111-8111-111111111111");
    assert.equal(normalized.metadata?.title, "عياده اسنان");
    assert.equal(normalized.metadata?.interactionType, "quick_reply");
  });

  it("leaves WhatsApp lists as interactive list payloads", () => {
    const adapter = createWhatsAppCloudAdapter();
    const formatted = adapter.formatOutbound(
      {
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
      },
      {
        conversationId: "conv-1",
        companyChannelId: "cc-wa-1",
        channelKey: "whatsapp",
        externalThreadId: "15551234567",
        text: "اختَر الخيار الأنسب لك.",
        metadata: {
          outboundPayload: {
            kind: "list",
            title: "اختر خدمة",
            body: "اختَر الخيار الأنسب لك.",
            buttonLabel: "عرض الخيارات",
            sections: [
              {
                title: "خدمات",
                rows: [{ id: "svc-1", title: "عياده اسنان" }],
              },
            ],
          },
        },
      },
    );

    const payload = formatted.payload as {
      type: string;
      interactive?: { type: string; action?: { button: string } };
    };
    assert.equal(payload.type, "interactive");
    assert.equal(payload.interactive?.type, "list");
    assert.equal(payload.interactive?.action?.button, "عرض الخيارات");
  });

  it("leaves WhatsApp and Messenger on Facebook Graph", () => {
    assert.equal(
      whatsAppMessagesUrl({
        phoneNumberId: "123456789",
        accessToken: "EAAB-page-token",
        verifyToken: "verify",
        apiVersion: "v21.0",
      }),
      "https://graph.facebook.com/v21.0/123456789/messages",
    );
    assert.equal(
      messengerMessagesUrl({
        pageId: "111222333",
        accessToken: "EAAB-page-token",
        verifyToken: "verify",
        apiVersion: "v21.0",
      }),
      "https://graph.facebook.com/v21.0/111222333/messages",
    );
  });
});
