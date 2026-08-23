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
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { OutboundMessagePipeline } from "../pipelines/outbound-message-pipeline.js";
import { createChannelAdapterRegistry } from "../adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import { CompanyChannelNotFoundError, DeliveryFailedError } from "../errors.js";
import type { WhatsAppMessagesCommercialPort } from "../ports/whatsapp-messages-commercial-port.js";
import type {
  ChannelDeliveryEventRepository,
  ChannelSessionRepository,
  CreateDeliveryEventInput,
  UpdateDeliveryEventInput,
} from "../repositories/channel-platform-repositories.js";
import type {
  ChannelDeliveryEventRecord,
  ChannelSessionRecord,
  ResolvedCompanyChannel,
} from "../types.js";
import { createContext } from "../test-utils.js";

type StubWhatsAppSendMode = "success" | "fail" | "missing_id";

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sendCalls = 0;
  lastFormattedPayload: Record<string, unknown> | null = null;

  constructor(private readonly mode: StubWhatsAppSendMode = "success") {}

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-wa",
      channelKey: this.channelKey,
      idempotencyKey: "wamid.in",
      externalThreadId: "15551234567",
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: "15551234567",
      externalMessageId: "wamid.in",
      senderExternalId: "15551234567",
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
    this.lastFormattedPayload = formattedPayload;
    if (this.mode === "fail") {
      throw new Error("Meta send failed");
    }
    if (this.mode === "missing_id") {
      return { externalMessageId: undefined, providerResponse: {} };
    }
    return {
      externalMessageId: "wamid.out-success-1",
      providerResponse: { messages: [{ id: "wamid.out-success-1" }] },
    };
  }
}

function commercial(
  allowed: boolean,
  usage?: { recordCalls: number; recorded: boolean[] },
  reason: "entitled" | "not_entitled" | "quota_exceeded" = allowed ? "entitled" : "not_entitled",
): WhatsAppMessagesCommercialPort {
  return {
    async checkAccess() {
      return { allowed, reason };
    },
    async recordUsage() {
      if (usage) {
        usage.recordCalls += 1;
        usage.recorded.push(true);
      }
      return { recorded: true, reason: "recorded" };
    },
  };
}

function buildPipelineHarness(input: {
  commercial?: WhatsAppMessagesCommercialPort;
  whatsAppMode?: StubWhatsAppSendMode;
}) {
  const companyChannel: ResolvedCompanyChannel = {
    id: "company-channel-wa",
    companyId: "company-1",
    channelKey: "whatsapp",
    displayName: "WhatsApp",
    isEnabled: true,
    provider: "meta_cloud",
    configuration: {},
  };

  const deliveryEvents: ChannelDeliveryEventRecord[] = [];
  let deliverySeq = 0;

  const deliveryRepository: ChannelDeliveryEventRepository = {
    createEvent: async (eventInput: CreateDeliveryEventInput) => {
      deliverySeq += 1;
      const record: ChannelDeliveryEventRecord = {
        id: `delivery-${deliverySeq}`,
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
      };
      deliveryEvents.push(record);
      return record;
    },
    updateEvent: async (updateInput: UpdateDeliveryEventInput) => {
      const record = deliveryEvents.find((item) => item.id === updateInput.deliveryEventId)!;
      Object.assign(record, {
        delivery_status: updateInput.deliveryStatus,
        external_message_id: updateInput.externalMessageId ?? record.external_message_id,
        provider_response: updateInput.providerResponse ?? record.provider_response,
        sent_at: updateInput.sentAt ?? record.sent_at,
        attempt_count: updateInput.attemptCount ?? record.attempt_count,
        error_message: updateInput.errorMessage ?? record.error_message,
        failed_at: updateInput.failedAt ?? record.failed_at,
      });
      return record;
    },
    findById: async (id) => deliveryEvents.find((item) => item.id === id) ?? null,
    findByExternalMessageId: async () => null,
  };

  const sessions: ChannelSessionRecord[] = [
    {
      id: "session-wa-1",
      company_id: "company-1",
      company_channel_id: companyChannel.id,
      conversation_id: "conv-wa-1",
      channel_key: "whatsapp",
      external_thread_id: "15551234567",
      sender_external_id: "15551234567",
      session_status: "active",
      metadata: {},
      last_inbound_at: null,
      last_outbound_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const sessionRepository: ChannelSessionRepository = {
    findByExternalThread: async () => sessions[0] ?? null,
    createSession: async () => sessions[0]!,
    reattachConversation: async () => sessions[0]!,
    updateSessionMetadata: async () => sessions[0]!,
    touchInbound: async () => sessions[0]!,
    touchOutbound: async (sessionId) => {
      const record = sessions.find((session) => session.id === sessionId)!;
      record.last_outbound_at = new Date().toISOString();
      return record;
    },
  };

  const whatsAppAdapter = new StubWhatsAppAdapter(input.whatsAppMode ?? "success");

  const pipeline = new OutboundMessagePipeline(
    {
      registry: {
        getCompanyChannel: async () => companyChannel,
      },
      conversation: {
        createConversation: async () => ({ id: "conv-wa-1" }),
        addIncomingMessage: async (messageInput) => ({
          id: "msg-in-1",
          conversationId: messageInput.conversationId,
          messageType: "incoming",
          content: messageInput.content,
          createdAt: new Date().toISOString(),
        }),
        addOutgoingMessage: async (messageInput) => ({
          id: "msg-out-1",
          conversationId: messageInput.conversationId,
          messageType: "outgoing",
          content: messageInput.content,
          createdAt: new Date().toISOString(),
        }),
      },
      runtime: {
        execute: async () => ({
          executionId: "runtime-1",
          responseContent: "noop",
          correlationId: "corr-1",
        }),
      },
      whatsappMessagesCommercial: input.commercial,
    },
    createChannelAdapterRegistry([createStubWebChatAdapter(), whatsAppAdapter]),
    new DeliveryTrackingEngine(deliveryRepository),
    sessionRepository,
  );

  return {
    pipeline,
    whatsAppAdapter,
    deliveryEvents,
    companyChannel,
    sessions,
  };
}

describe("OutboundMessagePipeline WhatsApp commercial enforcement", () => {
  it("1. entitlement denied → no Meta call", async () => {
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: commercial(false, undefined, "not_entitled"),
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext(), {
          companyId: "company-1",
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp",
          conversationId: "conv-wa-1",
          channelSessionId: "session-wa-1",
          externalThreadId: "15551234567",
          text: "Blocked",
        }),
      DeliveryFailedError,
    );
    assert.equal(whatsAppAdapter.sendCalls, 0);
  });

  it("2. quota exceeded → no Meta call", async () => {
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: commercial(false, undefined, "quota_exceeded"),
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext(), {
          companyId: "company-1",
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp",
          conversationId: "conv-wa-1",
          channelSessionId: "session-wa-1",
          externalThreadId: "15551234567",
          text: "Quota blocked",
        }),
      (error: Error) => error instanceof DeliveryFailedError && error.message.includes("quota"),
    );
    assert.equal(whatsAppAdapter.sendCalls, 0);
  });

  it("3. no quota / entitled → send allowed and usage recorded", async () => {
    const usage = { recordCalls: 0, recorded: [] as boolean[] };
    const { pipeline, whatsAppAdapter, deliveryEvents } = buildPipelineHarness({
      commercial: commercial(true, usage),
    });
    const response = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa",
      channelKey: "whatsapp",
      conversationId: "conv-wa-1",
      channelSessionId: "session-wa-1",
      externalThreadId: "15551234567",
      text: "Hello",
    });
    assert.equal(whatsAppAdapter.sendCalls, 1);
    assert.equal(response.deliveryStatus, "sent");
    assert.equal(response.externalMessageId, "wamid.out-success-1");
    assert.equal(usage.recordCalls, 1);
    assert.equal(deliveryEvents[0]?.delivery_status, "sent");
  });

  it("4. failed Meta send → zero usage events", async () => {
    const usage = { recordCalls: 0, recorded: [] as boolean[] };
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: commercial(true, usage),
      whatsAppMode: "fail",
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext(), {
          companyId: "company-1",
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp",
          conversationId: "conv-wa-1",
          channelSessionId: "session-wa-1",
          externalThreadId: "15551234567",
          text: "Fail",
        }),
      /Meta send failed/,
    );
    assert.equal(whatsAppAdapter.sendCalls, 1);
    assert.equal(usage.recordCalls, 0);
  });

  it("5. missing externalMessageId → zero usage events", async () => {
    const usage = { recordCalls: 0, recorded: [] as boolean[] };
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: commercial(true, usage),
      whatsAppMode: "missing_id",
    });
    const response = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa",
      channelKey: "whatsapp",
      conversationId: "conv-wa-1",
      channelSessionId: "session-wa-1",
      externalThreadId: "15551234567",
      text: "No id",
    });
    assert.equal(whatsAppAdapter.sendCalls, 1);
    assert.equal(usage.recordCalls, 0);
    assert.equal(response.externalMessageId, undefined);
  });

  it("6. usage recording failure does not trigger a second Meta send", async () => {
    let recordAttempts = 0;
    const failingCommercial: WhatsAppMessagesCommercialPort = {
      async checkAccess() {
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        recordAttempts += 1;
        return { recorded: false, reason: "ingest_failed" };
      },
    };
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: failingCommercial,
    });
    const response = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: "company-channel-wa",
      channelKey: "whatsapp",
      conversationId: "conv-wa-1",
      channelSessionId: "session-wa-1",
      externalThreadId: "15551234567",
      text: "Best effort metering",
    });
    assert.equal(whatsAppAdapter.sendCalls, 1);
    assert.equal(recordAttempts, 1);
    assert.equal(response.deliveryStatus, "sent");
  });

  it("7. non-WhatsApp channels remain unchanged without commercial port", async () => {
    const usage = { recordCalls: 0, recorded: [] as boolean[] };
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-1",
      companyId: "company-1",
      channelKey: "web_chat",
      displayName: "Web Chat",
      isEnabled: true,
      provider: "stub",
      configuration: {},
    };
    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (eventInput: CreateDeliveryEventInput) =>
        ({
          id: "delivery-1",
          company_id: eventInput.companyId,
          delivery_status: "pending",
        }) as ChannelDeliveryEventRecord,
      updateEvent: async (updateInput: UpdateDeliveryEventInput) =>
        ({
          id: updateInput.deliveryEventId,
          delivery_status: updateInput.deliveryStatus,
          external_message_id: updateInput.externalMessageId,
        }) as ChannelDeliveryEventRecord,
      findById: async () => null,
      findByExternalMessageId: async () => null,
    };
    const sessionRepository: ChannelSessionRepository = {
      findByExternalThread: async () =>
        ({
          id: "session-1",
        }) as ChannelSessionRecord,
      createSession: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      reattachConversation: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      updateSessionMetadata: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      touchInbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      touchOutbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
    };
    const pipeline = new OutboundMessagePipeline(
      {
        registry: { getCompanyChannel: async () => companyChannel },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async (messageInput) => ({
            id: "msg-in-1",
            conversationId: messageInput.conversationId,
            messageType: "incoming",
            content: messageInput.content,
            createdAt: new Date().toISOString(),
          }),
          addOutgoingMessage: async (messageInput) => ({
            id: "msg-out-1",
            conversationId: messageInput.conversationId,
            messageType: "outgoing",
            content: messageInput.content,
            createdAt: new Date().toISOString(),
          }),
        },
        runtime: {
          execute: async () => ({
            executionId: "runtime-1",
            responseContent: "noop",
            correlationId: "corr-1",
          }),
        },
        whatsappMessagesCommercial: commercial(true, usage),
      },
      createChannelAdapterRegistry([createStubWebChatAdapter()]),
      new DeliveryTrackingEngine(deliveryRepository),
      sessionRepository,
    );

    await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: companyChannel.id,
      channelKey: "web_chat",
      conversationId: "conv-1",
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "Web chat ok",
    });
    assert.equal(usage.recordCalls, 0);
  });

  it("8. rejects mismatched companyId before Meta send", async () => {
    const { pipeline, whatsAppAdapter } = buildPipelineHarness({
      commercial: commercial(true),
    });
    await assert.rejects(
      () =>
        pipeline.process(createContext({ isSuperAdmin: true, companyId: "company-other" }), {
          companyId: "company-other",
          companyChannelId: "company-channel-wa",
          channelKey: "whatsapp",
          conversationId: "conv-wa-1",
          channelSessionId: "session-wa-1",
          externalThreadId: "15551234567",
          text: "Wrong tenant",
        }),
      CompanyChannelNotFoundError,
    );
    assert.equal(whatsAppAdapter.sendCalls, 0);
  });
});

describe("OutboundMessagePipeline WhatsApp path coverage via dispatcher contract", () => {
  it("automation/human/AI paths share OutboundMessagePipeline commercial gate for whatsapp", async () => {
    let checkAccessCalls = 0;
    const port: WhatsAppMessagesCommercialPort = {
      async checkAccess() {
        checkAccessCalls += 1;
        return { allowed: true, reason: "entitled" };
      },
      async recordUsage() {
        return { recorded: true, reason: "recorded" };
      },
    };
    const { pipeline } = buildPipelineHarness({ commercial: port });

    const sources = [
      { metadata: { source: "automation", automationRunId: "run-1" } },
      { metadata: { source: "ai_employee", aiEmployeeId: "emp-1" } },
      { metadata: { source: "agent", agentUserId: "user-1" } },
    ];

    for (const source of sources) {
      await pipeline.process(createContext(), {
        companyId: "company-1",
        companyChannelId: "company-channel-wa",
        channelKey: "whatsapp",
        conversationId: "conv-wa-1",
        channelSessionId: "session-wa-1",
        externalThreadId: "15551234567",
        text: `Outbound from ${String(source.metadata.source)}`,
        metadata: source.metadata,
      });
    }

    assert.equal(checkAccessCalls, 3);
  });
});
