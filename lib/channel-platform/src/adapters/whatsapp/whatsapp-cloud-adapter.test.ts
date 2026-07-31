import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyWhatsAppWebhookChallenge, parseWhatsAppWebhookEvents } from "./whatsapp-api-client.js";
import { createWhatsAppCloudAdapter } from "./whatsapp-cloud-adapter.js";

const sampleInboundPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "123456789" },
            contacts: [{ profile: { name: "Jane Customer" }, wa_id: "15551234567" }],
            messages: [
              {
                from: "15551234567",
                id: "wamid.inbound-1",
                timestamp: "1710000000",
                type: "text",
                text: { body: "Hello from WhatsApp" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const sampleStatusPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "123456789" },
            statuses: [
              {
                id: "wamid.outbound-1",
                status: "delivered",
                timestamp: "1710000001",
                recipient_id: "15551234567",
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("WhatsApp webhook utilities", () => {
  it("verifies Meta webhook challenge", () => {
    const challenge = verifyWhatsAppWebhookChallenge({
      mode: "subscribe",
      verifyToken: "vault-verify-token",
      challenge: "1234567890",
      expectedVerifyToken: "vault-verify-token",
    });
    assert.equal(challenge, "1234567890");
  });

  it("rejects invalid verify token", () => {
    const challenge = verifyWhatsAppWebhookChallenge({
      mode: "subscribe",
      verifyToken: "wrong",
      challenge: "1234567890",
      expectedVerifyToken: "vault-verify-token",
    });
    assert.equal(challenge, null);
  });

  it("parses inbound message events", () => {
    const events = parseWhatsAppWebhookEvents(sampleInboundPayload);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "message");
    if (events[0]?.kind === "message") {
      assert.equal(events[0].externalMessageId, "wamid.inbound-1");
      assert.equal(events[0].senderName, "Jane Customer");
    }
  });

  it("parses delivery status events", () => {
    const events = parseWhatsAppWebhookEvents(sampleStatusPayload);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "status");
    if (events[0]?.kind === "status") {
      assert.equal(events[0].status, "delivered");
    }
  });
});

describe("WhatsAppCloudAdapter", () => {
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

  it("normalizes inbound text messages", () => {
    const adapter = createWhatsAppCloudAdapter();
    const envelope = adapter.parseWebhook!(ctx, sampleInboundPayload);
    assert.equal(envelope.eventType, "message.received");

    const normalized = adapter.normalizeInbound(ctx, envelope.payload);
    assert.equal(normalized.text, "Hello from WhatsApp");
    assert.equal(normalized.externalThreadId, "15551234567");
  });

  it("normalizes inbound interactive button replies with resume metadata", () => {
    const adapter = createWhatsAppCloudAdapter();
    const normalized = adapter.normalizeInbound(ctx, {
      message: {
        from: "15551234567",
        id: "wamid.interactive-1",
        timestamp: "1710000000",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "booking", title: "Book now" },
        },
      },
    });

    assert.equal(normalized.text, "Book now");
    assert.equal(normalized.metadata?.replyId, "booking");
    assert.equal(normalized.metadata?.title, "Book now");
    assert.equal(normalized.metadata?.kind, "interactive_reply");
  });

  it("formats and sends outbound text messages via Graph API", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const adapter = createWhatsAppCloudAdapter({
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.outbound-1" }] }),
        } as Response;
      },
      credentialsLoader: {
        loadByCompanyId: async () => ({
          accessToken: "test-token",
          phoneNumberId: "123456789",
          verifyToken: "vault-verify-token",
          apiVersion: "v21.0",
        }),
      },
    });

    const formatted = adapter.formatOutbound(ctx, {
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "whatsapp",
      externalThreadId: "15551234567",
      text: "AI reply",
    });

    const result = await adapter.sendOutbound(ctx, formatted);
    assert.equal(result.externalMessageId, "wamid.outbound-1");
    assert.match(String(requests[0]?.url), /123456789\/messages$/);
    assert.deepEqual((requests[0]?.body as { type: string }).type, "text");
  });

  it("formats template outbound messages", () => {
    const adapter = createWhatsAppCloudAdapter();
    const formatted = adapter.formatOutbound(ctx, {
      conversationId: "conv-1",
      companyChannelId: ctx.companyChannel.id,
      channelKey: "whatsapp",
      externalThreadId: "15551234567",
      text: "",
      metadata: {
        whatsappTemplate: { name: "hello_world", languageCode: "en_US" },
      },
    });

    const payload = formatted.payload as { type: string; template: { name: string } };
    assert.equal(payload.type, "template");
    assert.equal(payload.template.name, "hello_world");
  });

  it("normalizes inbound image attachments", () => {
    const adapter = createWhatsAppCloudAdapter();
    const normalized = adapter.normalizeInbound(ctx, {
      message: {
        from: "15551234567",
        id: "wamid.media-1",
        timestamp: "1710000000",
        type: "image",
        image: { id: "media-123", mime_type: "image/jpeg", caption: "Invoice scan" },
      },
    });

    assert.equal(normalized.text, "Invoice scan");
    assert.equal(normalized.attachments.length, 1);
    assert.equal(normalized.attachments[0]?.type, "image");
  });

  it("parses status webhook envelope", () => {
    const adapter = createWhatsAppCloudAdapter();
    const envelope = adapter.parseWebhook!(ctx, sampleStatusPayload);
    assert.equal(envelope.eventType, "message.status");
    assert.equal(envelope.externalMessageId, "wamid.outbound-1");
  });
});
