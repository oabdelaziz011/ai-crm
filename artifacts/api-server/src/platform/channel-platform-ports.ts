import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationChannelType, ConversationServices, ServiceContext as ConversationServiceContext } from "@workspace/ai-conversation";
import type { ChannelRegistryServices, ServiceContext as RegistryServiceContext } from "@workspace/channel-registry";
import type {
  ChannelConversationPort,
  ChannelPlatformPorts,
  ChannelRegistryPort,
  ChannelRuntimePort,
} from "@workspace/channel-platform";
import type { AutomationEngine } from "@workspace/automation-platform";
import type { RuntimeIntegrationServices, ServiceContext as RuntimeServiceContext } from "@workspace/runtime-integration";
import { extractResponseContent } from "@workspace/runtime-integration";
import { createChannelAutomationPort, createChannelAutomationPortFromClient } from "./channel-automation-port.js";
import type { ResolvedCompanyChannel } from "@workspace/channel-platform";

function mapCompanyChannelRecord(record: {
  id: string;
  company_id: string;
  display_name: string;
  is_enabled: boolean;
  provider: string;
  configuration: Record<string, unknown>;
  communication_channel?: { key?: string } | null;
}): ResolvedCompanyChannel | null {
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
}

export function createChannelRegistryPort(
  services: ChannelRegistryServices,
  ctx: RegistryServiceContext,
): ChannelRegistryPort {
  return {
    async getCompanyChannel(companyChannelId) {
      const record = await services.companyChannels.getCompanyChannel(ctx, companyChannelId);
      return mapCompanyChannelRecord(record);
    },

    async findCompanyChannelByPhoneNumberId(phoneNumberId) {
      const records = await services.companyChannels.findCompanyChannelByPhoneNumberId(
        ctx,
        phoneNumberId,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async findCompanyChannelsByWhatsAppVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelByWhatsAppVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledWhatsAppChannels() {
      const records = await services.companyChannels.listEnabledWhatsAppChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncWhatsAppPhoneNumberId(companyChannelId, phoneNumberId) {
      await services.companyChannels.syncWhatsAppPhoneNumberId(ctx, companyChannelId, phoneNumberId);
    },

    async findCompanyChannelByInstagramBusinessAccountId(instagramBusinessAccountId) {
      const records = await services.companyChannels.findCompanyChannelByInstagramBusinessAccountId(
        ctx,
        instagramBusinessAccountId,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async findCompanyChannelsByInstagramVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelsByInstagramVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledInstagramChannels() {
      const records = await services.companyChannels.listEnabledInstagramChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncInstagramBusinessAccountId(companyChannelId, instagramBusinessAccountId) {
      await services.companyChannels.syncInstagramBusinessAccountId(
        ctx,
        companyChannelId,
        instagramBusinessAccountId,
      );
    },

    async findCompanyChannelByMessengerPageId(pageId) {
      const records = await services.companyChannels.findCompanyChannelByMessengerPageId(ctx, pageId);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async findCompanyChannelsByMessengerVerifyToken(verifyToken) {
      const records = await services.companyChannels.findCompanyChannelsByMessengerVerifyToken(
        ctx,
        verifyToken,
      );
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledMessengerChannels() {
      const records = await services.companyChannels.listEnabledMessengerChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncMessengerPageId(companyChannelId, pageId) {
      await services.companyChannels.syncMessengerPageId(ctx, companyChannelId, pageId);
    },

    async findCompanyChannelByFromEmail(fromEmail) {
      const records = await services.companyChannels.findCompanyChannelByFromEmail(ctx, fromEmail);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async listEnabledEmailChannels() {
      const records = await services.companyChannels.listEnabledEmailChannels(ctx);
      return records
        .map((record) => mapCompanyChannelRecord(record))
        .filter((record): record is ResolvedCompanyChannel => record != null);
    },

    async syncEmailFromEmail(companyChannelId, fromEmail) {
      await services.companyChannels.syncEmailFromEmail(ctx, companyChannelId, fromEmail);
    },
  };
}

export function createChannelConversationPort(
  services: ConversationServices,
  ctx: ConversationServiceContext,
  options?: {
    resolveCompanyAssistantId?: (companyId: string) => Promise<string | null>;
  },
): ChannelConversationPort {
  return {
    resolveCompanyAssistantId: options?.resolveCompanyAssistantId,

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
        externalMessageId: input.externalMessageId ?? null,
        metadata: {
          ...(input.externalMessageId ? { externalMessageId: input.externalMessageId } : {}),
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
  options?: {
    resolveRuntimeActorUserId?: (companyId: string) => Promise<string | null>;
  },
): ChannelRuntimePort {
  return {
    async execute(input) {
      const actorUserId = options?.resolveRuntimeActorUserId
        ? await options.resolveRuntimeActorUserId(input.companyId)
        : ctx.userId;

      const runtimeCtx: RuntimeServiceContext = {
        ...ctx,
        companyId: input.companyId,
        userId: actorUserId ?? ctx.userId,
      };

      const response = await services.coordinator.execute(runtimeCtx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        messageText: input.messageText,
        providerConnectionId: input.runtimeConfig.providerConnectionId,
        knowledgeRetrieval: input.runtimeConfig.knowledgeRetrieval,
        executionPolicy: input.runtimeConfig.executionPolicy,
        pageContext: input.runtimeConfig.pageContext,
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
    automation?: AutomationEngine;
    supabaseClient?: SupabaseClient;
  },
  ctx: {
    registry: RegistryServiceContext;
    conversation: ConversationServiceContext;
    runtime: RuntimeServiceContext;
    automation?: RuntimeServiceContext;
  },
  options?: {
    resolveRuntimeActorUserId?: (companyId: string) => Promise<string | null>;
  },
): ChannelPlatformPorts {
  const resolveCompanyAssistantId = deps.supabaseClient
    ? async (companyId: string): Promise<string | null> => {
        const { data, error } = await deps.supabaseClient!
          .from("ai_assistant_settings")
          .select("id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        return data?.id ?? null;
      }
    : undefined;

  const ports: ChannelPlatformPorts = {
    registry: createChannelRegistryPort(deps.channelRegistry, ctx.registry),
    conversation: createChannelConversationPort(deps.conversation, ctx.conversation, {
      resolveCompanyAssistantId,
    }),
    runtime: createChannelRuntimePort(deps.runtime, ctx.runtime, {
      resolveRuntimeActorUserId: options?.resolveRuntimeActorUserId,
    }),
  };

  if (deps.automation && ctx.automation) {
    ports.automation = deps.supabaseClient
      ? createChannelAutomationPortFromClient(deps.automation, ctx.automation, deps.supabaseClient)
      : createChannelAutomationPort(deps.automation, ctx.automation);
  }

  return ports;
}
