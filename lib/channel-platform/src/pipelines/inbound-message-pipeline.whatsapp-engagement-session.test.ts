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
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { WhatsAppMessagesCommercialPort } from "../ports/whatsapp-messages-commercial-port.js";
import { readAiEmployeeEngagement } from "../services/ai-employee-engagement-session.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;
  sentTexts: string[] = [];

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-wa-1",
      channelKey: this.channelKey,
      idempotencyKey: String(rawPayload.externalMessageId ?? "wamid.in"),
      externalThreadId: String(rawPayload.externalThreadId ?? "201011404300"),
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201011404300"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? "201011404300"),
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
    this.sentTexts.push(String(formattedPayload.text ?? ""));
    return {
      externalMessageId: `wamid.out-${this.sendCalls}`,
      providerResponse: { messages: [{ id: `wamid.out-${this.sendCalls}` }] },
    };
  }
}

function whatsappCommercial(): WhatsAppMessagesCommercialPort {
  return {
    async checkAccess() {
      return { allowed: true, reason: "entitled" };
    },
    async recordUsage() {
      return { recorded: true, reason: "recorded" };
    },
  };
}

function createEmployeeRuntime(sessionTimeoutMinutes = 1440) {
  return {
    async resolveForInboundChannel(input: { companyId: string }) {
      if (input.companyId !== "company-1") return null;
      return {
        aiEmployeeId: "emp-wa-1",
        conversationMetadataSeed: { aiEmployeeId: "emp-wa-1" },
        sessionTimeoutMinutes,
      };
    },
    async resolveSessionTimeoutMinutes() {
      return sessionTimeoutMinutes;
    },
    async resolveWhatsAppDeterministicWelcome() {
      return { welcomeText: "مرحبًا بعودتك" };
    },
    async prepareForConversation() {
      return {
        runtimeConfig: {
          providerConnectionId: "provider-1",
          pageContext: { systemPrompt: "You are helpful." },
        },
        metadataPatch: { aiEmployeeId: "emp-wa-1" },
      };
    },
  } satisfies NonNullable<ChannelPlatformPorts["employeeRuntime"]>;
}

async function routeWhatsApp(
  env: ReturnType<typeof createTestEnvironment>,
  input: {
    externalThreadId: string;
    idempotencyKey: string;
    text?: string;
  },
) {
  return env.router.routeInbound(createContext(), {
    companyId: "company-1",
    companyChannelId: env.companyChannel.id,
    channelKey: "whatsapp",
    source: "webhook",
    executeAi: true,
    idempotencyKey: input.idempotencyKey,
    externalThreadId: input.externalThreadId,
    externalMessageId: input.idempotencyKey,
    payload: {
      text: input.text ?? "مرحبًا",
      externalThreadId: input.externalThreadId,
      senderExternalId: input.externalThreadId,
    },
  });
}

describe("InboundMessagePipeline WhatsApp engagement session", () => {
  it("keeps conversation_id stable but starts a new engagement after timeout", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        companyId: "company-1",
        channelKey: "whatsapp",
        displayName: "WhatsApp",
        provider: "meta",
        configuration: { phoneNumberId: "123456789" },
      },
      adapters: [adapter],
      employeeRuntime: createEmployeeRuntime(1440),
      whatsappMessagesCommercial: whatsappCommercial(),
      runtimeResponse: "كيف أساعدك؟",
    });

    const thread = "wa-engagement-gap-1";
    const first = await routeWhatsApp(env, {
      externalThreadId: thread,
      idempotencyKey: "wamid.engagement-1",
      text: "إلغاء",
    });
    const session = env.sessions.find((item) => item.external_thread_id === thread)!;
    const conversationId = session.conversation_id;
    const firstEngagement = readAiEmployeeEngagement(session.metadata);

    session.last_inbound_at = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const second = await routeWhatsApp(env, {
      externalThreadId: thread,
      idempotencyKey: "wamid.engagement-2",
      text: "هاي",
    });
    const secondEngagement = readAiEmployeeEngagement(
      env.sessions.find((item) => item.external_thread_id === thread)!.metadata,
    );

    assert.equal(second.conversationId, conversationId);
    assert.equal(first.conversationId, conversationId);
    assert.notEqual(secondEngagement?.startedAt, firstEngagement?.startedAt);
    // Timeout rotates engagement but preserves welcomeDeliveredAt (see resolveAiEmployeeEngagement).
    // Welcome is once per delivered engagement stamp — not resent on inactivity rotation alone.
    assert.equal(adapter.sentTexts.filter((text) => text === "مرحبًا بعودتك").length, 1);
    // First: "إلغاء" → welcome + AI. Second: "هاي" greeting-only after welcome → skip AI.
    assert.equal(env.runtimeCalls, 1);
  });

  it("does not write engagement metadata for web_chat", async () => {
    const env = createTestEnvironment({
      employeeRuntime: createEmployeeRuntime(),
      runtimeResponse: "Web reply",
    });

    await env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "web_chat",
      source: "webhook",
      executeAi: true,
      externalThreadId: "web-user-1",
      payload: { text: "Hello" },
      runtimeConfig: { providerConnectionId: "provider-1" },
    });

    for (const session of env.sessions) {
      assert.equal(readAiEmployeeEngagement(session.metadata), null);
    }
  });
});
