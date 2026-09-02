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
import type { WhatsAppMessagesCommercialPort } from "../ports/whatsapp-messages-commercial-port.js";
import { createContext, createTestEnvironment } from "../test-utils.js";

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;

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

  async sendOutbound(): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
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

function createEmployeeRuntime() {
  return {
    async resolveForInboundChannel(input: { companyId: string }) {
      if (input.companyId !== "company-1") return null;
      return {
        aiEmployeeId: "emp-wa-1",
        conversationMetadataSeed: { aiEmployeeId: "emp-wa-1" },
        sessionTimeoutMinutes: 1440,
      };
    },
    async prepareForConversation() {
      return {
        runtimeConfig: {
          providerConnectionId: "conn-1",
          executionPolicy: {},
        },
        metadataPatch: null,
      };
    },
  };
}

async function routeWhatsApp(
  env: ReturnType<typeof createTestEnvironment>,
  input: {
    idempotencyKey: string;
    text: string;
    executeAi?: boolean;
  },
) {
  return env.router.routeInbound(createContext(), {
    companyId: "company-1",
    companyChannelId: env.companyChannel.id,
    channelKey: "whatsapp",
    source: "webhook",
    executeAi: input.executeAi ?? true,
    idempotencyKey: input.idempotencyKey,
    externalThreadId: "201011404300",
    externalMessageId: input.idempotencyKey,
    payload: {
      text: input.text,
      externalThreadId: "201011404300",
      senderExternalId: "201011404300",
    },
  });
}

describe("inbound automation gate (human handoff)", () => {
  it("skips AI runtime when the gate blocks automated replies", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        channelKey: "whatsapp",
        provider: "meta",
      },
      adapters: [adapter],
      employeeRuntime: createEmployeeRuntime(),
      whatsappMessagesCommercial: whatsappCommercial(),
      inboundAutomationGate: {
        async evaluate() {
          return {
            allowAutomatedReply: false,
            reason: "owner_human_agent",
            source: "handoff_ownership",
          };
        },
      },
    });

    const result = await routeWhatsApp(env, {
      idempotencyKey: "wamid.handoff-1",
      text: "I still need a human",
    });

    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.automationCalls, 0);
    assert.equal(env.incomingMessages.length, 1);
    assert.equal(result.responseContent, undefined);
    assert.ok(result.conversationId);
  });

  it("runs AI runtime when the gate allows automated replies", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        channelKey: "whatsapp",
        provider: "meta",
      },
      adapters: [adapter],
      employeeRuntime: createEmployeeRuntime(),
      whatsappMessagesCommercial: whatsappCommercial(),
      inboundAutomationGate: {
        async evaluate() {
          return {
            allowAutomatedReply: true,
            reason: "owner_ai_employee",
            source: "handoff_ownership",
          };
        },
      },
    });

    const result = await routeWhatsApp(env, {
      idempotencyKey: "wamid.handoff-allow-1",
      text: "hello",
    });

    assert.equal(env.runtimeCalls, 1);
    assert.match(String(result.responseContent ?? ""), /hello/i);
  });

  it("skips sticky workflow when the gate blocks", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        channelKey: "whatsapp",
        provider: "meta",
      },
      adapters: [adapter],
      whatsappMessagesCommercial: whatsappCommercial(),
      workflowBinding: {
        companyId: "company-1",
        companyChannelId: "company-channel-wa-1",
        automationFlowId: "flow-1",
        enabled: true,
        executable: true,
      },
      inboundAutomationGate: {
        async evaluate() {
          return {
            allowAutomatedReply: false,
            reason: "owner_queue",
            source: "handoff_ownership",
          };
        },
      },
    });

    await routeWhatsApp(env, {
      idempotencyKey: "wamid.handoff-wf-1",
      text: "continue booking",
      executeAi: false,
    });

    assert.equal(env.automationCalls, 0);
    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.incomingMessages.length, 1);
  });

  it("fails closed when the wired gate throws", async () => {
    const adapter = new StubWhatsAppAdapter();
    const env = createTestEnvironment({
      companyChannel: {
        id: "company-channel-wa-1",
        channelKey: "whatsapp",
        provider: "meta",
      },
      adapters: [adapter],
      employeeRuntime: createEmployeeRuntime(),
      whatsappMessagesCommercial: whatsappCommercial(),
      inboundAutomationGate: {
        async evaluate() {
          throw new Error("ownership_lookup_failed");
        },
      },
    });

    await routeWhatsApp(env, {
      idempotencyKey: "wamid.handoff-err-1",
      text: "are you there?",
    });

    assert.equal(env.runtimeCalls, 0);
    assert.equal(env.incomingMessages.length, 1);
  });
});
