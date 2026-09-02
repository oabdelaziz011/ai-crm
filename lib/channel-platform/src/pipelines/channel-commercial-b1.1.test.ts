/**
 * B1.1 — channel commercial entitlement enforcement (inbound + outbound + email direct).
 * Run: node --import tsx/esm --test src/pipelines/channel-commercial-b1.1.test.ts
 */
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
import type { ChannelCommercialEntitlementPort } from "../ports/channel-commercial-entitlement-port.js";
import type { WhatsAppMessagesCommercialPort } from "../ports/whatsapp-messages-commercial-port.js";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { OutboundMessagePipeline } from "../pipelines/outbound-message-pipeline.js";
import { ChannelRouter } from "../router/channel-router.js";
import { InboundMessagePipeline } from "../pipelines/inbound-message-pipeline.js";
import { DeliveryStatusPipeline } from "../pipelines/delivery-status-pipeline.js";
import { createChannelAdapterRegistry } from "../adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import { DeliveryFailedError } from "../errors.js";
import { createContext } from "../test-utils.js";

function entitlementPort(
  allowedByChannel: Record<string, boolean>,
): ChannelCommercialEntitlementPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "entitlement_unavailable", featureCode: null };
      }
      const key = input.channelKey.trim().toLowerCase();
      const featureCode =
        key === "whatsapp"
          ? "whatsapp_channel"
          : key === "messenger"
            ? "facebook_channel"
            : key === "instagram"
              ? "instagram_channel"
              : key === "email"
                ? "email_channel"
                : key === "sms"
                  ? "sms_channel"
                  : null;
      if (!featureCode) {
        return { allowed: true, reason: "not_applicable", featureCode: null };
      }
      const allowed = allowedByChannel[key] ?? false;
      return {
        allowed,
        reason: allowed ? "entitled" : "not_entitled",
        featureCode,
      };
    },
  };
}

class StubChannelAdapter implements ChannelAdapterPort {
  sendCalls = 0;

  constructor(readonly channelKey: string) {}

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "cc-1",
      channelKey: this.channelKey,
      idempotencyKey: `${this.channelKey}-in-1`,
      externalThreadId: "thread-1",
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: "thread-1",
      externalMessageId: `${this.channelKey}-msg-1`,
      senderExternalId: "sender-1",
      text: String(payload.text ?? "hi"),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { text: message.text };
  }

  async sendOutbound(): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
    return { externalMessageId: `${this.channelKey}-out-1`, providerResponse: {} };
  }
}

function buildRouterHarness(input: {
  channelKey: string;
  entitled: boolean;
}) {
  let inboundProcessCalls = 0;
  const adapter = new StubChannelAdapter(input.channelKey);
  const companyChannel = {
    id: "cc-1",
    companyId: "company-1",
    channelKey: input.channelKey,
    displayName: input.channelKey,
    isEnabled: true,
    provider: "stub",
    configuration: {},
  };

  const inboundPipeline = {
    process: async () => {
      inboundProcessCalls += 1;
      return {
        inboundEventId: "evt-1",
        conversationId: "conv-1",
        duplicate: false,
      };
    },
  } as unknown as InboundMessagePipeline;

  const router = new ChannelRouter(
    inboundPipeline,
    {} as DeliveryStatusPipeline,
    createChannelAdapterRegistry([adapter, createStubWebChatAdapter()]),
    {
      registry: {
        getCompanyChannel: async () => companyChannel,
      },
      conversation: {} as never,
      runtime: {} as never,
      channelCommercialEntitlement: entitlementPort({
        [input.channelKey]: input.entitled,
      }),
    },
    { recordInboundRouted: async () => undefined },
  );

  return { router, adapter, inboundProcessCalls: () => inboundProcessCalls };
}

function buildOutboundHarness(input: {
  channelKey: string;
  entitled: boolean;
  includePort?: boolean;
  includeWhatsAppQuota?: boolean;
}) {
  const adapter = new StubChannelAdapter(input.channelKey);
  const companyChannel = {
    id: "cc-1",
    companyId: "company-1",
    channelKey: input.channelKey,
    displayName: input.channelKey,
    isEnabled: true,
    provider: "stub",
    configuration: {},
  };

  const commercial = input.includePort === false
    ? undefined
    : entitlementPort({ [input.channelKey]: input.entitled });

  const whatsappCommercial: WhatsAppMessagesCommercialPort | undefined =
    input.channelKey === "whatsapp"
      ? {
          async checkAccess() {
            return {
              allowed: input.includeWhatsAppQuota !== false,
              reason: input.includeWhatsAppQuota === false ? "quota_exceeded" : "entitled",
            };
          },
          async recordUsage() {
            return { recorded: true, reason: "recorded" };
          },
        }
      : undefined;

  const deliveryRepository = {
    createEvent: async (eventInput: {
      companyId: string;
      companyChannelId: string;
      channelKey: string;
      conversationId: string;
      channelSessionId?: string | null;
      outboundMessageId?: string | null;
      externalThreadId: string;
      payload: Record<string, unknown>;
    }) => ({
      id: "delivery-1",
      company_id: eventInput.companyId,
      company_channel_id: eventInput.companyChannelId,
      channel_key: eventInput.channelKey,
      conversation_id: eventInput.conversationId,
      channel_session_id: eventInput.channelSessionId ?? null,
      outbound_message_id: eventInput.outboundMessageId ?? null,
      external_thread_id: eventInput.externalThreadId,
      external_message_id: null,
      delivery_status: "pending" as const,
      attempt_count: 0,
      payload: eventInput.payload,
      provider_response: {},
      error_message: null,
      sent_at: null,
      delivered_at: null,
      read_at: null,
      failed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    updateEvent: async (updateInput: {
      deliveryEventId: string;
      deliveryStatus: string;
      externalMessageId?: string;
    }) => ({
      id: updateInput.deliveryEventId,
      delivery_status: updateInput.deliveryStatus,
      external_message_id: updateInput.externalMessageId ?? "ext-1",
    }),
    findById: async () => null,
    findByExternalMessageId: async () => null,
  };

  const sessionRepository = {
    findByExternalThread: async () => null,
    createSession: async () => ({
      id: "session-1",
      company_id: "company-1",
      company_channel_id: "cc-1",
      conversation_id: "conv-1",
      channel_key: input.channelKey,
      external_thread_id: "thread-1",
      sender_external_id: "sender-1",
      session_status: "active" as const,
      metadata: {},
      last_inbound_at: null,
      last_outbound_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    reattachConversation: async () => ({} as never),
    updateSessionMetadata: async () => ({} as never),
    touchInbound: async () => ({} as never),
    touchOutbound: async () => ({} as never),
  };

  const pipeline = new OutboundMessagePipeline(
    {
      registry: { getCompanyChannel: async () => companyChannel },
      conversation: {
        addOutgoingMessage: async () => ({
          id: "msg-out",
          conversationId: "conv-1",
          messageType: "outgoing",
          content: "x",
          createdAt: new Date().toISOString(),
        }),
      },
      runtime: { execute: async () => ({ executionId: "r1", responseContent: "", correlationId: "c1" }) },
      channelCommercialEntitlement: commercial,
      whatsappMessagesCommercial: whatsappCommercial,
    },
    createChannelAdapterRegistry([adapter, createStubWebChatAdapter()]),
    new DeliveryTrackingEngine(deliveryRepository as never),
    sessionRepository as never,
  );

  return { pipeline, adapter };
}

describe("B1.1 inbound webhook commercial gate", () => {
  for (const [channelKey, label] of [
    ["whatsapp", "WhatsApp"],
    ["messenger", "Facebook/Messenger"],
    ["instagram", "Instagram"],
    ["email", "Email"],
  ] as const) {
    it(`${label} + entitlement → ALLOW`, async () => {
      const { router, inboundProcessCalls } = buildRouterHarness({
        channelKey,
        entitled: true,
      });
      const result = await router.routeWebhook(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
        companyId: "company-1",
        companyChannelId: "cc-1",
        channelKey,
        rawPayload: { text: "hello" },
      });
      assert.notEqual(result.kind, "ignored");
      assert.equal(inboundProcessCalls(), 1);
    });

    it(`${label} without entitlement → DENY`, async () => {
      const { router, inboundProcessCalls } = buildRouterHarness({
        channelKey,
        entitled: false,
      });
      const result = await router.routeWebhook(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
        companyId: "company-1",
        companyChannelId: "cc-1",
        channelKey,
        rawPayload: { text: "hello" },
      });
      assert.equal(result.kind, "ignored");
      if (result.kind === "ignored") {
        assert.equal(result.reason, "channel_not_entitled");
      }
      assert.equal(inboundProcessCalls(), 0);
    });
  }

  it("undefined entitlement (missing company) → DENY", async () => {
    const router = buildRouterHarness({ channelKey: "whatsapp", entitled: true }).router;
    const result = await router.routeWebhook(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
      companyId: "",
      companyChannelId: "cc-1",
      channelKey: "whatsapp",
      rawPayload: { text: "hello" },
    });
    assert.equal(result.kind, "ignored");
  });
});

describe("B1.1 outbound pipeline commercial gate", () => {
  for (const channelKey of ["whatsapp", "messenger", "instagram", "email", "sms"] as const) {
    it(`${channelKey} → entitlement required`, async () => {
      const { pipeline, adapter } = buildOutboundHarness({
        channelKey,
        entitled: false,
      });
      await assert.rejects(
        () =>
          pipeline.process(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
            companyId: "company-1",
            companyChannelId: "cc-1",
            channelKey,
            conversationId: "conv-1",
            channelSessionId: "session-1",
            externalThreadId: "thread-1",
            text: "Blocked",
          }),
        DeliveryFailedError,
      );
      assert.equal(adapter.sendCalls, 0);
    });
  }

  it("non-sellable channel (web_chat) skips commercial gate", async () => {
    const adapter = createStubWebChatAdapter();
    const p = new OutboundMessagePipeline(
      {
        registry: {
          getCompanyChannel: async () => ({
            id: "cc-1",
            companyId: "company-1",
            channelKey: "web_chat",
            displayName: "Web Chat",
            isEnabled: true,
            provider: "stub",
            configuration: {},
          }),
        },
        conversation: {
          addOutgoingMessage: async () => ({
            id: "msg-out",
            conversationId: "conv-1",
            messageType: "outgoing",
            content: "x",
            createdAt: new Date().toISOString(),
          }),
        },
        runtime: { execute: async () => ({ executionId: "r1", responseContent: "", correlationId: "c1" }) },
      },
      createChannelAdapterRegistry([adapter]),
      new DeliveryTrackingEngine({
        createEvent: async (eventInput) => ({
          id: "d1",
          company_id: eventInput.companyId,
          company_channel_id: eventInput.companyChannelId,
          channel_key: eventInput.channelKey,
          conversation_id: eventInput.conversationId,
          channel_session_id: eventInput.channelSessionId ?? null,
          outbound_message_id: eventInput.outboundMessageId ?? null,
          external_thread_id: eventInput.externalThreadId,
          external_message_id: null,
          delivery_status: "pending",
          attempt_count: 0,
          payload: eventInput.payload,
          provider_response: {},
          error_message: null,
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        updateEvent: async (u) => ({ id: u.deliveryEventId, delivery_status: u.deliveryStatus, external_message_id: "x" }),
        findById: async () => null,
        findByExternalMessageId: async () => null,
      } as never),
      {
        findByExternalThread: async () => null,
        createSession: async () => ({} as never),
        reattachConversation: async () => ({} as never),
        updateSessionMetadata: async () => ({} as never),
        touchInbound: async () => ({} as never),
        touchOutbound: async () => ({} as never),
      } as never,
    );
    await assert.doesNotReject(() =>
      p.process(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
        companyId: "company-1",
        companyChannelId: "cc-1",
        channelKey: "web_chat",
        conversationId: "conv-1",
        channelSessionId: "session-1",
        externalThreadId: "thread-1",
        text: "ok",
      }),
    );
  });

  it("missing commercial port on sellable channel → DENY", async () => {
    const { pipeline, adapter } = buildOutboundHarness({
      channelKey: "instagram",
      entitled: true,
      includePort: false,
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
          companyId: "company-1",
          companyChannelId: "cc-1",
          channelKey: "instagram",
          conversationId: "conv-1",
          channelSessionId: "session-1",
          externalThreadId: "thread-1",
          text: "Blocked",
        }),
      DeliveryFailedError,
    );
    assert.equal(adapter.sendCalls, 0);
  });
});

describe("B1.1 SYSTEM_CONTEXT + commercial", () => {
  it("SYSTEM_CONTEXT + entitled channel → ALLOW outbound", async () => {
    const { pipeline, adapter } = buildOutboundHarness({
      channelKey: "messenger",
      entitled: true,
    });
    await pipeline.process(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
      companyId: "company-1",
      companyChannelId: "cc-1",
      channelKey: "messenger",
      conversationId: "conv-1",
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "ok",
    });
    assert.equal(adapter.sendCalls, 1);
  });

  it("SYSTEM_CONTEXT + unentitled channel → DENY outbound", async () => {
    const { pipeline, adapter } = buildOutboundHarness({
      channelKey: "messenger",
      entitled: false,
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext({ isSuperAdmin: true, hasPermission: () => true }), {
          companyId: "company-1",
          companyChannelId: "cc-1",
          channelKey: "messenger",
          conversationId: "conv-1",
          channelSessionId: "session-1",
          externalThreadId: "thread-1",
          text: "Blocked",
        }),
      DeliveryFailedError,
    );
    assert.equal(adapter.sendCalls, 0);
  });
});
