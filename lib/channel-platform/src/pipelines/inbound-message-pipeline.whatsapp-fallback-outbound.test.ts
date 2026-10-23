import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

const FALLBACK_SNIPPET = "الرد الآلي متوقف مؤقتاً";

class CountingWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;
  sentTexts: string[] = [];

  constructor(private readonly failSend: boolean) {}

  parseWebhook(): WebhookEnvelopeDto {
    throw new Error("not used");
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201000000001"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? "201000000001"),
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound(
    _ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
    const text = String(formattedPayload.text ?? "");
    this.sentTexts.push(text);
    if (this.failSend) {
      throw new Error("fake_provider_rejected");
    }
    return {
      externalMessageId: `wamid.fallback-${this.sendCalls}`,
      providerResponse: { fake: true },
    };
  }
}

function whatsappRequest(idempotencyKey: string) {
  return {
    companyId: "company-1",
    companyChannelId: "company-channel-1",
    channelKey: "whatsapp" as const,
    source: "webhook" as const,
    idempotencyKey,
    externalThreadId: "201000000001",
    externalMessageId: idempotencyKey,
    payload: {
      text: "I need a product demo next week",
      externalThreadId: "201000000001",
      externalMessageId: idempotencyKey,
      senderExternalId: "201000000001",
    },
    executeAi: true,
    aiAssistantId: "assistant-1",
    runtimeConfig: { providerConnectionId: "provider-1" },
  };
}

describe("WhatsApp AI fallback outbound", () => {
  it("sends one fallback reply when AI runtime fails and records processed on success", async () => {
    const adapter = new CountingWhatsAppAdapter(false);
    const env = createTestEnvironment({
      runtimeError: new Error("AI_PROVIDER chat completion failed"),
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
    });

    const result = await env.router.routeInbound(createContext(), whatsappRequest("wamid.fallback-ok"));

    assert.equal(env.runtimeCalls, 1);
    assert.equal(adapter.sendCalls, 1);
    assert.equal(adapter.sentTexts.some((text) => text.includes(FALLBACK_SNIPPET)), true);
    assert.equal(result.outboundError, undefined);
    assert.ok(result.outboundDeliveryId);
    assert.equal(result.responseContent?.includes(FALLBACK_SNIPPET), true);
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");

    const replay = await env.router.routeInbound(createContext(), whatsappRequest("wamid.fallback-ok"));
    assert.equal(replay.duplicate, true);
    assert.equal(adapter.sendCalls, 1);
    assert.equal(env.runtimeCalls, 1);
  });

  it("does not mark processed when the fallback send fails, and redelivery does not send again", async () => {
    const adapter = new CountingWhatsAppAdapter(true);
    const env = createTestEnvironment({
      runtimeError: new Error("AI_PROVIDER timeout"),
      adapters: [adapter],
      companyChannel: { channelKey: "whatsapp", provider: "fake" },
    });

    const result = await env.router.routeInbound(createContext(), whatsappRequest("wamid.fallback-fail"));

    assert.equal(env.runtimeCalls, 1);
    assert.equal(adapter.sendCalls, 1);
    assert.equal(result.outboundError, "fake_provider_rejected");
    assert.equal(result.responseContent, undefined);
    assert.equal(env.inboundEvents[0]?.processing_status, "failed");
    assert.match(String(env.inboundEvents[0]?.error_message), /fake_provider_rejected/);
    assert.match(String(env.inboundEvents[0]?.runtime_execution_id), /whatsapp-fallback-undelivered:/);

    const replay = await env.router.routeInbound(createContext(), whatsappRequest("wamid.fallback-fail"));
    assert.equal(replay.duplicate, true);
    assert.equal(adapter.sendCalls, 1);
    assert.equal(env.runtimeCalls, 1);
    assert.equal(env.inboundEvents[0]?.processing_status, "failed");
  });
});
