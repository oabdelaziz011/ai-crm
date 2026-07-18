import type { ConversationChannelType, ConversationServices, ServiceContext as ConversationServiceContext } from "@workspace/ai-conversation";
import type { ServiceContext as RegistryServiceContext } from "@workspace/channel-registry";
import type { ChannelRegistryServices } from "@workspace/channel-registry";
import type {
  ChannelConversationPort,
  ChannelPlatformPorts,
  ChannelRegistryPort,
  ChannelRuntimePort,
} from "@workspace/channel-platform";
import type { ServiceContext as RuntimeServiceContext } from "@workspace/runtime-integration";
import type { RuntimeIntegrationServices } from "@workspace/runtime-integration";
import { extractResponseContent } from "@workspace/runtime-integration";

export function createChannelRegistryPort(
  services: ChannelRegistryServices,
  ctx: RegistryServiceContext,
): ChannelRegistryPort {
  return {
    async getCompanyChannel(companyChannelId) {
      const record = await services.companyChannels.getCompanyChannel(ctx, companyChannelId);
      const channelKey = record.communication_channel?.key;
      if (!channelKey) return null;

      return {
        id: record.id,
        companyId: record.company_id,
        channelKey,
        displayName: record.display_name,
        isEnabled: record.is_enabled,
        provider: record.provider,
        configuration: record.configuration ?? {},
      };
    },
  };
}

export function createChannelConversationPort(
  services: ConversationServices,
  ctx: ConversationServiceContext,
): ChannelConversationPort {
  return {
    async createConversation(input) {
      const created = await services.conversations.createConversation(ctx, {
        companyId: input.companyId,
        aiAssistantId: input.aiAssistantId,
        companyChannelId: input.companyChannelId,
        channelType: input.channelType as ConversationChannelType,
        metadata: input.metadata,
      });
      return { id: created.id };
    },

    async addIncomingMessage(input) {
      const message = await services.messages.addMessage(ctx, {
        conversationId: input.conversationId,
        messageType: "incoming",
        contentType: "text",
        content: input.content,
        metadata: {
          externalMessageId: input.externalMessageId,
          ...(input.metadata ?? {}),
        },
      });

      return {
        id: message.id,
        conversationId: message.conversation_id,
        messageType: message.message_type,
        content: message.content,
        createdAt: message.created_at,
      };
    },

    async addOutgoingMessage(input) {
      const message = await services.messages.addMessage(ctx, {
        conversationId: input.conversationId,
        messageType: "outgoing",
        contentType: "text",
        content: input.content,
        metadata: input.metadata,
      });

      return {
        id: message.id,
        conversationId: message.conversation_id,
        messageType: message.message_type,
        content: message.content,
        createdAt: message.created_at,
      };
    },
  };
}

export function createChannelRuntimePort(
  services: RuntimeIntegrationServices,
  ctx: RuntimeServiceContext,
): ChannelRuntimePort {
  return {
    async execute(input) {
      const response = await services.coordinator.execute(ctx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        messageText: input.messageText,
        providerConnectionId: input.runtimeConfig.providerConnectionId,
        knowledgeRetrieval: input.runtimeConfig.knowledgeRetrieval,
        executionPolicy: input.runtimeConfig.executionPolicy,
        correlationId: input.correlationId,
        onStreamChunk: input.onStreamChunk,
        abortSignal: input.abortSignal,
      });

      return {
        executionId: response.executionId,
        responseContent: extractResponseContent(response.responseContent),
        correlationId: response.correlationId ?? input.correlationId ?? "",
      };
    },
  };
}

export function createChannelPlatformPortsWithContext(
  deps: {
    channelRegistry: ChannelRegistryServices;
    conversation: ConversationServices;
    runtime: RuntimeIntegrationServices;
  },
  ctx: {
    registry: RegistryServiceContext;
    conversation: ConversationServiceContext;
    runtime: RuntimeServiceContext;
  },
): ChannelPlatformPorts {
  return {
    registry: createChannelRegistryPort(deps.channelRegistry, ctx.registry),
    conversation: createChannelConversationPort(deps.conversation, ctx.conversation),
    runtime: createChannelRuntimePort(deps.runtime, ctx.runtime),
  };
}
