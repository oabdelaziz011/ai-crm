import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeliveryTrackingEngine } from "../engines/delivery-tracking-engine.js";
import { OutboundMessagePipeline } from "../pipelines/outbound-message-pipeline.js";
import { createChannelAdapterRegistry } from "../adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "../adapters/stub-web-chat-adapter.js";
import { PermissionDeniedError } from "../errors.js";
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

describe("OutboundMessagePipeline integration", () => {
  it("creates pending delivery and marks sent after adapter dispatch", async () => {
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-1",
      companyId: "company-1",
      channelKey: "web_chat",
      displayName: "Web Chat",
      isEnabled: true,
      provider: "stub",
      configuration: {},
    };

    const deliveryEvents: ChannelDeliveryEventRecord[] = [];
    const sessions: ChannelSessionRecord[] = [
      {
        id: "session-1",
        company_id: "company-1",
        company_channel_id: companyChannel.id,
        conversation_id: "conv-1",
        channel_key: "web_chat",
        external_thread_id: "thread-1",
        sender_external_id: null,
        session_status: "active",
        metadata: {},
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (input: CreateDeliveryEventInput) => {
        const record: ChannelDeliveryEventRecord = {
          id: "delivery-1",
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId ?? null,
          outbound_message_id: input.outboundMessageId ?? null,
          external_thread_id: input.externalThreadId,
          external_message_id: null,
          delivery_status: "pending",
          attempt_count: 0,
          payload: input.payload,
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
      updateEvent: async (input: UpdateDeliveryEventInput) => {
        const record = deliveryEvents[0]!;
        Object.assign(record, {
          delivery_status: input.deliveryStatus,
          external_message_id: input.externalMessageId ?? record.external_message_id,
          provider_response: input.providerResponse ?? record.provider_response,
          sent_at: input.sentAt ?? record.sent_at,
          attempt_count: input.attemptCount ?? record.attempt_count,
        });
        return record;
      },
      findById: async () => deliveryEvents[0] ?? null,
    };

    const sessionRepository: ChannelSessionRepository = {
      findByExternalThread: async () => sessions[0] ?? null,
      createSession: async () => sessions[0]!,
      reattachConversation: async () => sessions[0]!,
      updateSessionMetadata: async (sessionId) => {
        const record = sessions.find((session) => session.id === sessionId)!;
        return record;
      },
      touchInbound: async () => sessions[0]!,
      touchOutbound: async (sessionId) => {
        const record = sessions.find((session) => session.id === sessionId)!;
        record.last_outbound_at = new Date().toISOString();
        return record;
      },
    };

    const pipeline = new OutboundMessagePipeline(
      {
        registry: {
          getCompanyChannel: async () => companyChannel,
        },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async (input) => ({
            id: "msg-in-1",
            conversationId: input.conversationId,
            messageType: "incoming",
            content: input.content,
            createdAt: new Date().toISOString(),
          }),
          addOutgoingMessage: async (input) => ({
            id: "msg-out-1",
            conversationId: input.conversationId,
            messageType: "outgoing",
            content: input.content,
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
      },
      createChannelAdapterRegistry([createStubWebChatAdapter()]),
      new DeliveryTrackingEngine(deliveryRepository),
      sessionRepository,
    );

    const ctx = createContext();
    const response = await pipeline.process(ctx, {
      companyId: "company-1",
      companyChannelId: companyChannel.id,
      channelKey: "web_chat",
      conversationId: "conv-1",
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "Outbound hello",
    });

    assert.equal(response.deliveryStatus, "sent");
    assert.ok(response.externalMessageId);
    assert.equal(deliveryEvents[0]?.delivery_status, "sent");
    assert.ok(sessions[0]?.last_outbound_at);
  });

  it("links outboundMessageId on delivery event and confirms conversation message after provider send", async () => {
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-1",
      companyId: "company-1",
      channelKey: "web_chat",
      displayName: "Web Chat",
      isEnabled: true,
      provider: "stub",
      configuration: {},
    };

    const deliveryEvents: ChannelDeliveryEventRecord[] = [];
    const confirms: Array<{ messageId: string; status: string; externalMessageId?: string | null }> = [];
    const sessions: ChannelSessionRecord[] = [
      {
        id: "session-1",
        company_id: "company-1",
        company_channel_id: companyChannel.id,
        conversation_id: "conv-1",
        channel_key: "web_chat",
        external_thread_id: "thread-1",
        sender_external_id: null,
        session_status: "active",
        metadata: {},
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (input: CreateDeliveryEventInput) => {
        const record: ChannelDeliveryEventRecord = {
          id: "delivery-linked-1",
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId ?? null,
          outbound_message_id: input.outboundMessageId ?? null,
          external_thread_id: input.externalThreadId,
          external_message_id: null,
          delivery_status: "pending",
          attempt_count: 0,
          payload: input.payload,
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
      updateEvent: async (input: UpdateDeliveryEventInput) => {
        const record = deliveryEvents[0]!;
        Object.assign(record, {
          delivery_status: input.deliveryStatus,
          external_message_id: input.externalMessageId ?? record.external_message_id,
          provider_response: input.providerResponse ?? record.provider_response,
          sent_at: input.sentAt ?? record.sent_at,
          attempt_count: input.attemptCount ?? record.attempt_count,
        });
        return record;
      },
      findById: async () => deliveryEvents[0] ?? null,
    };

    const sessionRepository: ChannelSessionRepository = {
      findByExternalThread: async () => sessions[0] ?? null,
      createSession: async () => sessions[0]!,
      reattachConversation: async () => sessions[0]!,
      updateSessionMetadata: async (sessionId) => sessions.find((session) => session.id === sessionId)!,
      touchInbound: async () => sessions[0]!,
      touchOutbound: async (sessionId) => {
        const record = sessions.find((session) => session.id === sessionId)!;
        record.last_outbound_at = new Date().toISOString();
        return record;
      },
    };

    let addOutgoingCalls = 0;
    const pipeline = new OutboundMessagePipeline(
      {
        registry: {
          getCompanyChannel: async () => companyChannel,
        },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async (input) => ({
            id: "msg-in-1",
            conversationId: input.conversationId,
            messageType: "incoming",
            content: input.content,
            createdAt: new Date().toISOString(),
          }),
          addOutgoingMessage: async (input) => {
            addOutgoingCalls += 1;
            return {
              id: "msg-out-should-not-create",
              conversationId: input.conversationId,
              messageType: "outgoing",
              content: input.content,
              createdAt: new Date().toISOString(),
            };
          },
          confirmOutgoingDelivery: async (input) => {
            confirms.push(input);
          },
        },
        runtime: {
          execute: async () => ({
            executionId: "runtime-1",
            responseContent: "noop",
            correlationId: "corr-1",
          }),
        },
      },
      createChannelAdapterRegistry([createStubWebChatAdapter()]),
      new DeliveryTrackingEngine(deliveryRepository),
      sessionRepository,
    );

    const response = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: companyChannel.id,
      channelKey: "web_chat",
      conversationId: "conv-1",
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "AI reply already persisted",
      outboundMessageId: "msg-ai-persisted-1",
      persistConversationMessage: false,
    });

    assert.equal(addOutgoingCalls, 0);
    assert.equal(deliveryEvents[0]?.outbound_message_id, "msg-ai-persisted-1");
    assert.equal(response.deliveryStatus, "sent");
    assert.equal(response.conversationConfirmStatus, "confirmed");
    assert.equal(confirms.length, 1);
    assert.equal(confirms[0]?.messageId, "msg-ai-persisted-1");
    assert.equal(confirms[0]?.status, "sent");
    assert.ok(confirms[0]?.externalMessageId);
  });

  it("keeps provider send success when confirmOutgoingDelivery fails after retries", async () => {
    const companyChannel: ResolvedCompanyChannel = {
      id: "company-channel-1",
      companyId: "company-1",
      channelKey: "web_chat",
      displayName: "Web Chat",
      isEnabled: true,
      provider: "stub",
      configuration: {},
    };

    const deliveryEvents: ChannelDeliveryEventRecord[] = [];
    let confirmCalls = 0;

    const deliveryRepository: ChannelDeliveryEventRepository = {
      createEvent: async (input: CreateDeliveryEventInput) => {
        const record: ChannelDeliveryEventRecord = {
          id: "delivery-confirm-fail",
          company_id: input.companyId,
          company_channel_id: input.companyChannelId,
          channel_key: input.channelKey,
          conversation_id: input.conversationId,
          channel_session_id: input.channelSessionId ?? null,
          outbound_message_id: input.outboundMessageId ?? null,
          external_thread_id: input.externalThreadId,
          external_message_id: null,
          delivery_status: "pending",
          attempt_count: 0,
          payload: input.payload,
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
      updateEvent: async (input: UpdateDeliveryEventInput) => {
        const record = deliveryEvents[0]!;
        Object.assign(record, {
          delivery_status: input.deliveryStatus,
          external_message_id: input.externalMessageId ?? record.external_message_id,
          sent_at: input.sentAt ?? record.sent_at,
          attempt_count: input.attemptCount ?? record.attempt_count,
        });
        return record;
      },
      findById: async () => deliveryEvents[0] ?? null,
    };

    const pipeline = new OutboundMessagePipeline(
      {
        registry: { getCompanyChannel: async () => companyChannel },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async (input) => ({
            id: "msg-in-1",
            conversationId: input.conversationId,
            messageType: "incoming",
            content: input.content,
            createdAt: new Date().toISOString(),
          }),
          addOutgoingMessage: async (input) => ({
            id: "msg-out-1",
            conversationId: input.conversationId,
            messageType: "outgoing",
            content: input.content,
            createdAt: new Date().toISOString(),
          }),
          confirmOutgoingDelivery: async () => {
            confirmCalls += 1;
            throw new Error("confirm rpc unavailable");
          },
        },
        runtime: {
          execute: async () => ({
            executionId: "runtime-1",
            responseContent: "noop",
            correlationId: "corr-1",
          }),
        },
      },
      createChannelAdapterRegistry([createStubWebChatAdapter()]),
      new DeliveryTrackingEngine(deliveryRepository),
      {
        findByExternalThread: async () => null,
        createSession: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        reattachConversation: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        updateSessionMetadata: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        touchInbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        touchOutbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      },
    );

    const response = await pipeline.process(createContext(), {
      companyId: "company-1",
      companyChannelId: companyChannel.id,
      channelKey: "web_chat",
      conversationId: "conv-1",
      channelSessionId: "session-1",
      externalThreadId: "thread-1",
      text: "Human reply",
      outboundMessageId: "msg-human-1",
      persistConversationMessage: false,
    });

    assert.equal(response.deliveryStatus, "sent");
    assert.equal(deliveryEvents[0]?.delivery_status, "sent");
    assert.ok(response.externalMessageId);
    assert.equal(response.conversationConfirmStatus, "failed");
    assert.ok(confirmCalls >= 2);
  });

  it("requires dispatch permission", async () => {
    const env = createContext({ hasPermission: () => false });
    const pipeline = new OutboundMessagePipeline(
      {
        registry: { getCompanyChannel: async () => null },
        conversation: {
          createConversation: async () => ({ id: "conv-1" }),
          addIncomingMessage: async (input) => ({
            id: "msg-in-1",
            conversationId: input.conversationId,
            messageType: "incoming",
            content: input.content,
            createdAt: new Date().toISOString(),
          }),
          addOutgoingMessage: async (input) => ({
            id: "msg-out-1",
            conversationId: input.conversationId,
            messageType: "outgoing",
            content: input.content,
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
      },
      createChannelAdapterRegistry([createStubWebChatAdapter()]),
      new DeliveryTrackingEngine({
        createEvent: async (input) =>
          ({
            id: "delivery-1",
            delivery_status: "pending",
            company_id: input.companyId,
          }) as ChannelDeliveryEventRecord,
        updateEvent: async (input) =>
          ({
            id: input.deliveryEventId,
            delivery_status: input.deliveryStatus,
          }) as ChannelDeliveryEventRecord,
        findById: async () => null,
        findByExternalMessageId: async () => null,
      }),
      {
        findByExternalThread: async () => null,
        createSession: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        reattachConversation: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        touchInbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
        touchOutbound: async () => ({ id: "session-1" }) as ChannelSessionRecord,
      },
    );

    await assert.rejects(
      () =>
        pipeline.process(env, {
          companyId: "company-1",
          companyChannelId: "company-channel-1",
          channelKey: "web_chat",
          conversationId: "conv-1",
          channelSessionId: "session-1",
          externalThreadId: "thread-1",
          text: "Denied",
        }),
      PermissionDeniedError,
    );
  });
});
