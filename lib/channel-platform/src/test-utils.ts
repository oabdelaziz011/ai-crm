import type { ChannelAdapterPort } from "./ports/channel-adapter-port.js";
import { createChannelAdapterRegistry } from "./adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "./adapters/stub-web-chat-adapter.js";
import { ChannelDispatcher } from "./dispatcher/channel-dispatcher.js";
import { ChannelSessionEngine } from "./engines/channel-session-engine.js";
import { DeliveryTrackingEngine } from "./engines/delivery-tracking-engine.js";
import { DeliveryStatusPipeline } from "./pipelines/delivery-status-pipeline.js";
import { InboundMessagePipeline } from "./pipelines/inbound-message-pipeline.js";
import { OutboundMessagePipeline } from "./pipelines/outbound-message-pipeline.js";
import type {
  ChannelAutomationPort,
  ChannelConversationPort,
  ChannelDispatcherPort,
  ChannelPlatformPorts,
  ChannelRegistryPort,
  ChannelRuntimePort,
} from "./ports/channel-platform-ports.js";
import { ChannelRouter } from "./router/channel-router.js";
import { ChannelWorkflowResolver } from "./services/channel-workflow-resolver.js";
import type {
  ChannelDeliveryEventRepository,
  ChannelInboundEventRepository,
  ChannelSessionRepository,
  CreateDeliveryEventInput,
  CreateInboundEventInput,
  ResolveSessionInput,
  UpdateDeliveryEventInput,
  UpdateInboundEventInput,
} from "./repositories/channel-platform-repositories.js";
import type {
  ChannelDeliveryEventRecord,
  ChannelInboundEventRecord,
  ChannelSessionRecord,
  ConversationMessageSummary,
  ResolvedCompanyChannel,
  RuntimeExecutionSummary,
  ServiceContext,
} from "./types.js";

export function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["channel.platform.view", "channel.platform.route", "channel.platform.dispatch"].includes(code),
    ...overrides,
  };
}

export function createTestEnvironment(options?: {
  companyChannel?: Partial<ResolvedCompanyChannel>;
  runtimeResponse?: string;
  automationResponse?: string;
  automationPort?: ChannelAutomationPort;
  adapters?: ChannelAdapterPort[];
  workflowBinding?: {
    companyId: string;
    companyChannelId: string;
    automationFlowId: string;
    enabled?: boolean;
    executable?: boolean;
  };
}) {
  const companyChannel: ResolvedCompanyChannel = {
    id: "company-channel-1",
    companyId: "company-1",
    channelKey: "web_chat",
    displayName: "Web Chat",
    isEnabled: true,
    provider: "stub",
    configuration: {},
    ...options?.companyChannel,
  };

  const sessions: ChannelSessionRecord[] = [];
  const inboundEvents: ChannelInboundEventRecord[] = [];
  const deliveryEvents: ChannelDeliveryEventRecord[] = [];
  const incomingMessages: ConversationMessageSummary[] = [];
  const outgoingMessages: ConversationMessageSummary[] = [];
  const conversations: Array<{ id: string; companyChannelId: string }> = [];
  const telemetryEvents: Array<Record<string, unknown>> = [];
  let runtimeCalls = 0;
  let automationCalls = 0;

  const sessionRepository: ChannelSessionRepository = {
    findByExternalThread: async (companyChannelId, externalThreadId) =>
      sessions.find(
        (session) =>
          session.company_channel_id === companyChannelId && session.external_thread_id === externalThreadId,
      ) ?? null,
    createSession: async (input: ResolveSessionInput & { conversationId: string }) => {
      const record: ChannelSessionRecord = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        company_channel_id: input.companyChannelId,
        conversation_id: input.conversationId,
        channel_key: input.channelKey,
        external_thread_id: input.externalThreadId,
        sender_external_id: input.senderExternalId ?? null,
        session_status: "active",
        metadata: input.metadata ?? {},
        last_inbound_at: null,
        last_outbound_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      sessions.push(record);
      return record;
    },
    touchInbound: async (sessionId) => {
      const record = sessions.find((session) => session.id === sessionId)!;
      record.last_inbound_at = new Date().toISOString();
      return record;
    },
    touchOutbound: async (sessionId) => {
      const record = sessions.find((session) => session.id === sessionId)!;
      record.last_outbound_at = new Date().toISOString();
      return record;
    },
  };

  const inboundRepository: ChannelInboundEventRepository = {
    findByIdempotencyKey: async (companyChannelId, idempotencyKey) =>
      inboundEvents.find(
        (event) => event.company_channel_id === companyChannelId && event.idempotency_key === idempotencyKey,
      ) ?? null,
    createEvent: async (input: CreateInboundEventInput) => {
      const record: ChannelInboundEventRecord = {
        id: `inbound-${inboundEvents.length + 1}`,
        company_id: input.companyId,
        company_channel_id: input.companyChannelId,
        channel_key: input.channelKey,
        idempotency_key: input.idempotencyKey,
        external_thread_id: input.externalThreadId,
        external_message_id: input.externalMessageId ?? null,
        sender_external_id: input.senderExternalId ?? null,
        processing_status: "received",
        conversation_id: null,
        channel_session_id: null,
        incoming_message_id: null,
        runtime_execution_id: null,
        payload: input.payload,
        error_message: null,
        received_at: new Date().toISOString(),
        processed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inboundEvents.push(record);
      return record;
    },
    updateEvent: async (input: UpdateInboundEventInput) => {
      const record = inboundEvents.find((event) => event.id === input.inboundEventId)!;
      Object.assign(record, {
        processing_status: input.processingStatus,
        conversation_id: input.conversationId ?? record.conversation_id,
        channel_session_id: input.channelSessionId ?? record.channel_session_id,
        incoming_message_id: input.incomingMessageId ?? record.incoming_message_id,
        runtime_execution_id: input.runtimeExecutionId ?? record.runtime_execution_id,
        error_message: input.errorMessage ?? record.error_message,
        processed_at: input.processedAt ?? record.processed_at,
      });
      return record;
    },
  };

  const deliveryRepository: ChannelDeliveryEventRepository = {
    createEvent: async (input: CreateDeliveryEventInput) => {
      const record: ChannelDeliveryEventRecord = {
        id: `delivery-${deliveryEvents.length + 1}`,
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
      const record = deliveryEvents.find((event) => event.id === input.deliveryEventId)!;
      Object.assign(record, {
        delivery_status: input.deliveryStatus,
        external_message_id: input.externalMessageId ?? record.external_message_id,
        provider_response: input.providerResponse ?? record.provider_response,
        error_message: input.errorMessage ?? record.error_message,
        attempt_count: input.attemptCount ?? record.attempt_count,
        sent_at: input.sentAt ?? record.sent_at,
        delivered_at: input.deliveredAt ?? record.delivered_at,
        read_at: input.readAt ?? record.read_at,
        failed_at: input.failedAt ?? record.failed_at,
      });
      return record;
    },
    findById: async (deliveryEventId) => deliveryEvents.find((event) => event.id === deliveryEventId) ?? null,
    findByExternalMessageId: async (companyChannelId, externalMessageId) =>
      deliveryEvents.find(
        (event) =>
          event.company_channel_id === companyChannelId && event.external_message_id === externalMessageId,
      ) ?? null,
  };

  const registryPort: ChannelRegistryPort = {
    getCompanyChannel: async (companyChannelId) =>
      companyChannelId === companyChannel.id ? companyChannel : null,
    findCompanyChannelByPhoneNumberId: async (phoneNumberId) => {
      const configuredPhoneNumberId = companyChannel.configuration.phoneNumberId;
      if (typeof configuredPhoneNumberId === "string" && configuredPhoneNumberId === phoneNumberId) {
        return [companyChannel];
      }
      return [];
    },
    findCompanyChannelsByWhatsAppVerifyToken: async (verifyToken) => {
      const configuredVerifyToken = companyChannel.configuration.verifyToken;
      if (typeof configuredVerifyToken === "string" && configuredVerifyToken === verifyToken) {
        return [companyChannel];
      }
      return [];
    },
    listEnabledWhatsAppChannels: async () => [companyChannel],
    syncWhatsAppPhoneNumberId: async (companyChannelId, phoneNumberId) => {
      if (companyChannelId !== companyChannel.id) return;
      companyChannel.configuration.phoneNumberId = phoneNumberId;
    },
  };

  const conversationPort: ChannelConversationPort = {
    resolveCompanyAssistantId: async () => "assistant-company-default",
    createConversation: async (input) => {
      const record = {
        id: `conv-${conversations.length + 1}`,
        companyChannelId: input.companyChannelId,
      };
      conversations.push(record);
      return { id: record.id };
    },
    addIncomingMessage: async (input) => {
      const record: ConversationMessageSummary = {
        id: `msg-in-${incomingMessages.length + 1}`,
        conversationId: input.conversationId,
        messageType: "incoming",
        content: input.content,
        createdAt: new Date().toISOString(),
      };
      incomingMessages.push(record);
      return record;
    },
    addOutgoingMessage: async (input) => {
      const record: ConversationMessageSummary = {
        id: `msg-out-${outgoingMessages.length + 1}`,
        conversationId: input.conversationId,
        messageType: "outgoing",
        content: input.content,
        createdAt: new Date().toISOString(),
      };
      outgoingMessages.push(record);
      return record;
    },
  };

  const runtimePort: ChannelRuntimePort = {
    execute: async (input): Promise<RuntimeExecutionSummary> => {
      runtimeCalls += 1;
      return {
        executionId: "runtime-exec-1",
        responseContent: options?.runtimeResponse ?? `Echo: ${input.messageText}`,
        correlationId: input.correlationId ?? "corr-1",
      };
    },
  };

  const automationPort: ChannelAutomationPort =
    options?.automationPort ?? {
      startWorkflow: async (input) => {
        automationCalls += 1;
        return {
          runId: "automation-run-1",
          responseContent: options?.automationResponse ?? `Workflow: ${input.messageText}`,
        };
      },
    };

  const ports: ChannelPlatformPorts = {
    registry: registryPort,
    conversation: conversationPort,
    runtime: runtimePort,
    automation: automationPort,
  };

  const workflowResolver = options?.workflowBinding
    ? new ChannelWorkflowResolver({
        bindings: {
          async findByCompanyChannelId(companyChannelId) {
            const binding = options.workflowBinding!;
            if (binding.companyChannelId !== companyChannelId) return null;
            return {
              id: "binding-1",
              company_id: binding.companyId,
              company_channel_id: binding.companyChannelId,
              automation_flow_id: binding.automationFlowId,
              is_enabled: binding.enabled ?? true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
            };
          },
        },
        flowValidator: {
          async isExecutableFlow() {
            return options.workflowBinding?.executable ?? true;
          },
        },
      })
    : undefined;

  const adapterRegistry = createChannelAdapterRegistry([
    createStubWebChatAdapter(),
    ...(options?.adapters ?? []),
  ]);
  const sessionEngine = new ChannelSessionEngine(sessionRepository, ports);
  const deliveryEngine = new DeliveryTrackingEngine(deliveryRepository);
  const outboundPipeline = new OutboundMessagePipeline(ports, adapterRegistry, deliveryEngine, sessionRepository);

  const telemetry = {
    recordInboundRouted: async (input: Record<string, unknown>) => {
      telemetryEvents.push({ type: "inbound", ...input });
    },
    recordOutboundDispatched: async (input: Record<string, unknown>) => {
      telemetryEvents.push({ type: "outbound", ...input });
    },
    recordPipelineError: async (input: Record<string, unknown>) => {
      telemetryEvents.push({ type: "error", ...input });
    },
  };

  const dispatcher = new ChannelDispatcher(outboundPipeline, telemetry);
  const deliveryStatusPipeline = new DeliveryStatusPipeline(deliveryEngine, deliveryRepository);
  const inboundPipeline = new InboundMessagePipeline(
    ports,
    adapterRegistry,
    sessionEngine,
    dispatcher,
    inboundRepository,
    sessionRepository,
    workflowResolver,
  );

  const router = new ChannelRouter(
    inboundPipeline,
    deliveryStatusPipeline,
    adapterRegistry,
    ports,
    telemetry,
  );

  return {
    router,
    dispatcher,
    inboundPipeline,
    outboundPipeline,
    sessions,
    inboundEvents,
    deliveryEvents,
    incomingMessages,
    outgoingMessages,
    conversations,
    telemetryEvents,
    companyChannel,
    ports,
    adapterRegistry,
    sessionRepository,
    inboundRepository,
    deliveryRepository,
    get runtimeCalls() {
      return runtimeCalls;
    },
    get automationCalls() {
      return automationCalls;
    },
  };
}
