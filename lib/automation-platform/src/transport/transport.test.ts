import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ChannelProviderError,
  ChannelProviderNotFoundError,
  TransportDeliveryError,
  WebhookVerificationError,
} from "../errors.js";
import { BaseChannelProvider } from "./channel-provider.js";
import { createTransportChannelAdapterBridge } from "./adapter-bridge.js";
import type { DeliveryResult, OutboundMessage, ProviderCapabilities } from "./models.js";
import { extractInboundText } from "./models.js";
import { ChannelProviderRegistry, createDefaultChannelProviderRegistry } from "./provider-registry.js";
import { ExponentialBackoffRetryPolicy, executeWithRetry, NoRetryPolicy } from "./retry-policy.js";
import { createBuiltInChannelProviders } from "./stub-providers.js";
import { ChannelTransportService } from "./transport-service.js";
import { ChannelWebhookHandler, inboundToOrchestratorPayload } from "./webhook.js";

class FlakyProvider extends BaseChannelProvider {
  readonly channel = "telegram" as const;
  readonly providerKey = "generic.telegram";
  attempts = 0;

  getCapabilities(): ProviderCapabilities {
    return {
      channel: this.channel,
      providerKey: this.providerKey,
      supportsText: true,
      supportsButtons: true,
      supportsLists: true,
      supportsMedia: true,
      supportsTemplates: true,
      supportsInteractiveReplies: true,
      supportsDeliveryReceipts: true,
      supportsReadReceipts: true,
    };
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    this.attempts += 1;
    if (this.attempts < 2) {
      const error = new Error("temporary outage") as Error & { statusCode?: number };
      error.statusCode = 503;
      throw error;
    }
    return super.send(message);
  }
}

describe("ChannelProviderRegistry", () => {
  it("registers providers by channel and exposes capabilities", () => {
    const registry = createDefaultChannelProviderRegistry();
    const webChat = registry.get("web_chat");
    const capabilities = webChat.getCapabilities();

    assert.equal(webChat.providerKey, "generic.web_chat");
    assert.equal(capabilities.supportsText, true);
    assert.equal(capabilities.supportsLists, true);
    assert.throws(() => registry.get("slack" as never), ChannelProviderNotFoundError);
  });
});

describe("transport models and providers", () => {
  it("normalizes inbound message kinds", async () => {
    const provider = createBuiltInChannelProviders()[0]!;
    const text = provider.normalize({ externalUserId: "u1", text: "Hello" }, { companyId: "company-1" });
    assert.equal(text.kind, "text");

    const interactive = provider.normalize(
      { externalUserId: "u1", kind: "interactive_reply", replyId: "btn-1", title: "Yes" },
      { companyId: "company-1" },
    );
    assert.equal(interactive.kind, "interactive_reply");
    assert.equal(extractInboundText(interactive), "Yes");

    const media = provider.normalize(
      { externalUserId: "u1", kind: "media", mediaType: "image", url: "https://example.com/a.png" },
      { companyId: "company-1" },
    );
    assert.equal(media.kind, "media");

    const location = provider.normalize(
      { externalUserId: "u1", kind: "location", latitude: 1, longitude: 2, name: "HQ" },
      { companyId: "company-1" },
    );
    assert.equal(location.kind, "location");

    const contact = provider.normalize(
      { externalUserId: "u1", kind: "contact", name: "Ada", phone: "+100" },
      { companyId: "company-1" },
    );
    assert.equal(contact.kind, "contact");
  });

  it("sends outbound message kinds when supported", async () => {
    const provider = createBuiltInChannelProviders()[0]!;
    const text = await provider.send({
      kind: "text",
      companyId: "company-1",
      channel: "web_chat",
      externalUserId: "u1",
      text: "Hello",
    });
    assert.equal(text.status, "sent");

    const buttons = await provider.send({
      kind: "buttons",
      companyId: "company-1",
      channel: "web_chat",
      externalUserId: "u1",
      text: "Choose",
      buttons: [{ id: "yes", label: "Yes" }],
    });
    assert.equal(buttons.status, "sent");

    const api = createBuiltInChannelProviders()[1]!;
    await assert.rejects(
      () =>
        api.send({
          kind: "buttons",
          companyId: "company-1",
          channel: "api",
          externalUserId: "u1",
          text: "Choose",
          buttons: [{ id: "yes", label: "Yes" }],
        }),
      ChannelProviderError,
    );
  });

  it("verifies webhook signatures in a provider-neutral way", () => {
    const provider = createBuiltInChannelProviders()[0]!;
    assert.equal(
      provider.verifySignature({
        headers: { "x-webhook-signature": "secret-1" },
        rawBody: "{}",
        secret: "secret-1",
      }),
      true,
    );
    assert.throws(
      () =>
        provider.verifySignature({
          headers: {},
          rawBody: "{}",
          secret: "secret-1",
        }),
      WebhookVerificationError,
    );
  });
});

describe("RetryPolicy", () => {
  it("retries transient failures with exponential backoff", async () => {
    const policy = new ExponentialBackoffRetryPolicy({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 10 });
    let attempts = 0;
    const result = await executeWithRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("retry") as Error & { statusCode?: number };
        error.statusCode = 503;
        throw error;
      }
      return "ok";
    }, policy);

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  it("stops retrying when policy rejects the error", async () => {
    const policy = new NoRetryPolicy();
    await assert.rejects(
      () =>
        executeWithRetry(async () => {
          throw new Error("fatal");
        }, policy),
      /fatal/,
    );
  });
});

describe("ChannelTransportService", () => {
  it("delivers outbound messages through the provider registry with retry", async () => {
    const registry = new ChannelProviderRegistry().register(new FlakyProvider());
    const transport = new ChannelTransportService(registry, new ExponentialBackoffRetryPolicy({ maxAttempts: 3, baseDelayMs: 1 }));
    const provider = registry.get("telegram") as FlakyProvider;

    const result = await transport.send({
      kind: "text",
      companyId: "company-1",
      channel: "telegram",
      externalUserId: "u1",
      text: "Retry me",
    });

    assert.equal(result.status, "sent");
    assert.equal(provider.attempts, 2);
  });

  it("throws transport delivery error after retry exhaustion", async () => {
    class AlwaysFailProvider extends BaseChannelProvider {
      readonly channel = "instagram" as const;
      readonly providerKey = "generic.instagram";
      getCapabilities(): ProviderCapabilities {
        return {
          channel: this.channel,
          providerKey: this.providerKey,
          supportsText: true,
          supportsButtons: false,
          supportsLists: false,
          supportsMedia: false,
          supportsTemplates: false,
          supportsInteractiveReplies: false,
          supportsDeliveryReceipts: false,
          supportsReadReceipts: false,
        };
      }
      async send(): Promise<DeliveryResult> {
        throw new Error("permanent");
      }
    }

    const registry = new ChannelProviderRegistry().register(new AlwaysFailProvider());
    const transport = new ChannelTransportService(registry, new ExponentialBackoffRetryPolicy({ maxAttempts: 2, baseDelayMs: 1 }));
    await assert.rejects(
      () =>
        transport.send({
          kind: "text",
          companyId: "company-1",
          channel: "instagram",
          externalUserId: "u1",
          text: "fail",
        }),
      TransportDeliveryError,
    );
  });
});

describe("ChannelWebhookHandler", () => {
  it("processes verified webhook payloads and delivery updates", async () => {
    const registry = createDefaultChannelProviderRegistry();
    const handler = new ChannelWebhookHandler(registry);

    const result = await handler.handle(
      {
        channel: "web_chat",
        companyId: "company-1",
        headers: { "x-webhook-signature": "secret" },
        rawBody: JSON.stringify({
          externalUserId: "u1",
          text: "Inbound",
          deliveryUpdates: [{ messageId: "m1", status: "delivered", providerMessageId: "p1" }],
        }),
        payload: {
          externalUserId: "u1",
          text: "Inbound",
          deliveryUpdates: [{ messageId: "m1", status: "delivered", providerMessageId: "p1" }],
        },
      },
      { companyId: "company-1", webhookSecret: "secret" },
    );

    assert.equal(result.verified, true);
    assert.equal(result.inbound?.kind, "text");
    assert.equal(result.deliveryUpdates[0]?.status, "delivered");
    assert.deepEqual(inboundToOrchestratorPayload(result.inbound!), {
      kind: "text",
      externalUserId: "u1",
      customerId: null,
      text: "Inbound",
      externalMessageId: null,
      metadata: {},
    });
  });
});

describe("TransportChannelAdapterBridge", () => {
  it("bridges transport inbound/outbound models to orchestrator adapters", async () => {
    const registry = createDefaultChannelProviderRegistry();
    const bridge = createTransportChannelAdapterBridge(registry, new NoRetryPolicy());
    const normalized = bridge.normalize({ externalUserId: "u1", text: "Bridge" }, "company-1", "web_chat");
    assert.equal(normalized.text, "Bridge");

    await bridge.send({
      channel: "web_chat",
      companyId: "company-1",
      sessionId: "session-1",
      externalUserId: "u1",
      messageType: "text",
      text: "Outbound",
    });
  });
});
