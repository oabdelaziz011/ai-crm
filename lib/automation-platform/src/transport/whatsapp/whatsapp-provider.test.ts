import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacSha256Hex } from "@workspace/platform-crypto";
import { WebhookVerificationError } from "../../errors.js";
import { createTransportChannelAdapterBridge } from "../adapter-bridge.js";
import { ChannelTransportService } from "../transport-service.js";
import { createDefaultChannelProviderRegistry } from "../provider-registry.js";
import { ExponentialBackoffRetryPolicy } from "../retry-policy.js";
import {
  parseWhatsAppWebhookEvents,
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from "./whatsapp-api-client.js";
import { InMemoryWhatsAppConfigStore } from "./whatsapp-config.js";
import { createWhatsAppProvider } from "./whatsapp-provider.js";
import { createWhatsAppWebhookController } from "./whatsapp-webhook-controller.js";

const companyConfig = {
  companyId: "company-1",
  phoneNumberId: "123456789",
  businessAccountId: "waba-1",
  accessToken: "test-access-token",
  verifyToken: "vault-verify-token",
  appSecret: "meta-app-secret",
};

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

function createTestStack(fetchFn?: typeof fetch) {
  const configStore = new InMemoryWhatsAppConfigStore().set(companyConfig);
  const registry = createDefaultChannelProviderRegistry({
    whatsappConfigResolver: configStore.resolve.bind(configStore),
    fetchFn,
  });
  const retryPolicy = new ExponentialBackoffRetryPolicy({ maxAttempts: 3, baseDelayMs: 1 });
  const bridge = createTransportChannelAdapterBridge(registry, retryPolicy);
  const provider = createWhatsAppProvider({
    configResolver: configStore.resolve.bind(configStore),
    fetchFn,
  });
  const transport = new ChannelTransportService(registry, retryPolicy);
  const webhookController = createWhatsAppWebhookController({
    provider,
    bridge,
    configResolver: configStore.resolve.bind(configStore),
  });
  return { registry, bridge, provider, transport, webhookController, configStore };
}

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

  it("validates Meta sha256 signatures", async () => {
    const body = JSON.stringify(sampleInboundPayload);
    const digest = await hmacSha256Hex("meta-app-secret", body);
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: "meta-app-secret",
        requireSecret: true,
      }),
      true,
    );
  });

  it("parses inbound and status webhook events", () => {
    const inboundEvents = parseWhatsAppWebhookEvents(sampleInboundPayload);
    assert.equal(inboundEvents.length, 1);
    assert.equal(inboundEvents[0]?.kind, "message");

    const statusEvents = parseWhatsAppWebhookEvents(sampleStatusPayload);
    assert.equal(statusEvents.length, 1);
    assert.equal(statusEvents[0]?.kind, "status");
    if (statusEvents[0]?.kind === "status") {
      assert.equal(statusEvents[0].status, "delivered");
    }
  });
});

describe("WhatsAppProvider", () => {
  it("registers in ChannelProviderRegistry", () => {
    const { registry } = createTestStack();
    assert.equal(registry.has("whatsapp"), true);
    assert.equal(registry.get("whatsapp").providerKey, "meta.whatsapp.cloud");
  });

  it("normalizes inbound message types", () => {
    const { provider } = createTestStack();
    const context = { companyId: "company-1" };

    const text = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.1",
          timestamp: "1710000000",
          type: "text",
          text: { body: "Hello" },
        },
      },
      context,
    );
    assert.equal(text.kind, "text");

    const buttonReply = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.2",
          timestamp: "1710000000",
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "yes", title: "Yes" } },
        },
      },
      context,
    );
    assert.equal(buttonReply.kind, "interactive_reply");

    const listReply = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.3",
          timestamp: "1710000000",
          type: "interactive",
          interactive: { type: "list_reply", list_reply: { id: "opt-1", title: "Option 1" } },
        },
      },
      context,
    );
    assert.equal(listReply.kind, "interactive_reply");

    const image = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.4",
          timestamp: "1710000000",
          type: "image",
          image: { id: "media-1", mime_type: "image/png", caption: "Photo" },
        },
      },
      context,
    );
    assert.equal(image.kind, "media");
    if (image.kind === "media") assert.equal(image.mediaType, "image");

    const location = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.5",
          timestamp: "1710000000",
          type: "location",
          location: { latitude: 24.7, longitude: 46.6, name: "Riyadh" },
        },
      },
      context,
    );
    assert.equal(location.kind, "location");

    const contact = provider.normalize(
      {
        message: {
          from: "15551234567",
          id: "wamid.6",
          timestamp: "1710000000",
          type: "contacts",
          contacts: [{ name: { formatted_name: "Ada Lovelace" }, phones: [{ phone: "+100" }] }],
        },
      },
      context,
    );
    assert.equal(contact.kind, "contact");
  });

  it("sends outbound message types via Graph API", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const { transport } = createTestStack(async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.outbound-1" }] }),
      } as Response;
    });

    await transport.send({
      kind: "text",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      text: "Reply",
    });
    assert.equal((requests[0]?.body as { type: string }).type, "text");

    await transport.send({
      kind: "buttons",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      text: "Choose",
      buttons: [{ id: "yes", label: "Yes" }],
    });
    assert.equal((requests[1]?.body as { type: string }).type, "interactive");

    await transport.send({
      kind: "list",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      title: "Menu",
      body: "Pick one",
      buttonLabel: "Open",
      sections: [{ title: "Main", rows: [{ id: "a", title: "A" }] }],
    });
    assert.equal((requests[2]?.body as { type: string }).type, "interactive");

    await transport.send({
      kind: "template",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      templateKey: "order_update",
      language: "en_US",
      variables: {},
    });
    assert.equal((requests[3]?.body as { type: string }).type, "template");

    await transport.send({
      kind: "media",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      mediaType: "image",
      url: "https://example.com/image.png",
      caption: "Image",
    });
    assert.equal((requests[4]?.body as { type: string }).type, "image");
    assert.match(requests[0]?.url ?? "", /123456789\/messages$/);
  });

  it("retries transient WhatsApp API failures", async () => {
    let attempts = 0;
    const { transport } = createTestStack(async () => {
      attempts += 1;
      if (attempts < 2) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: "Service unavailable" } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.outbound-2" }] }),
      } as Response;
    });

    const result = await transport.send({
      kind: "text",
      companyId: "company-1",
      channel: "whatsapp",
      externalUserId: "15551234567",
      text: "Retry",
    });
    assert.equal(result.status, "sent");
    assert.equal(attempts, 2);
  });

  it("rejects invalid webhook signatures", async () => {
    const { provider } = createTestStack();
    await assert.rejects(
      () =>
        provider.verifySignature({
          headers: { "x-hub-signature-256": "sha256=deadbeef" },
          rawBody: "{}",
          secret: "meta-app-secret",
        }),
      WebhookVerificationError,
    );
  });
});

describe("WhatsAppWebhookController", () => {
  it("handles Meta GET verification", async () => {
    const { webhookController } = createTestStack();
    const result = await webhookController.verifyGet("company-1", {
      "hub.mode": "subscribe",
      "hub.verify_token": "vault-verify-token",
      "hub.challenge": "1234567890",
    });
    assert.equal(result.status, 200);
    assert.equal(result.body, "1234567890");
  });

  it("forwards verified inbound messages to the transport adapter bridge", async () => {
    const { webhookController } = createTestStack();
    const rawBody = JSON.stringify(sampleInboundPayload);
    const digest = await hmacSha256Hex("meta-app-secret", rawBody);

    const result = await webhookController.handlePost({
      companyId: "company-1",
      headers: { "x-hub-signature-256": `sha256=${digest}` },
      rawBody,
      payload: sampleInboundPayload,
    });

    assert.equal(result.verified, true);
    assert.equal(result.inbounds.length, 1);
    assert.equal(result.inbounds[0]?.text, "Hello from WhatsApp");
    assert.equal(result.inbounds[0]?.externalUserId, "15551234567");
  });

  it("maps delivery lifecycle status updates", async () => {
    const { webhookController } = createTestStack();
    const rawBody = JSON.stringify(sampleStatusPayload);
    const digest = await hmacSha256Hex("meta-app-secret", rawBody);

    const result = await webhookController.handlePost({
      companyId: "company-1",
      headers: { "x-hub-signature-256": `sha256=${digest}` },
      rawBody,
      payload: sampleStatusPayload,
    });

    assert.equal(result.verified, true);
    assert.equal(result.deliveryUpdates.length, 1);
    assert.equal(result.deliveryUpdates[0]?.status, "delivered");
    assert.equal(result.deliveryUpdates[0]?.providerMessageId, "wamid.outbound-1");
  });
});
