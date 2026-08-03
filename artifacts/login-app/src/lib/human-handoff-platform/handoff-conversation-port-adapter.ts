import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createConversationServices,
  type ServiceContext,
} from "@workspace/ai-conversation";
import type { HandoffConversationPort } from "@workspace/human-handoff-platform";

export function createLoginAppHandoffConversationPort(
  client: SupabaseClient,
): HandoffConversationPort {
  const services = createConversationServices(client);

  return {
    async assignConversation(input) {
      const ctx: ServiceContext = {
        userId: input.actorUserId,
        companyId: input.companyId,
        isSuperAdmin: false,
        hasPermission: () => true,
      };
      await services.conversations.assignConversation(ctx, {
        conversationId: input.conversationId,
        assignedUserId: input.assignedUserId,
      });
    },

    async releaseConversation(input) {
      const ctx: ServiceContext = {
        userId: input.actorUserId,
        companyId: input.companyId,
        isSuperAdmin: false,
        hasPermission: () => true,
      };
      await services.conversations.releaseConversation(ctx, {
        conversationId: input.conversationId,
      });
    },

    async closeConversation(input) {
      const ctx: ServiceContext = {
        userId: input.actorUserId,
        companyId: input.companyId,
        isSuperAdmin: false,
        hasPermission: () => true,
      };
      await services.conversations.closeConversation(ctx, {
        conversationId: input.conversationId,
      });
    },

    async updateMetadata(input) {
      const ctx: ServiceContext = {
        userId: null,
        companyId: input.companyId,
        isSuperAdmin: false,
        hasPermission: () => true,
      };
      await services.conversations.updateMetadata(ctx, {
        conversationId: input.conversationId,
        metadata: input.metadata,
      });
    },

    async getConversation(input) {
      const ctx: ServiceContext = {
        userId: null,
        companyId: input.companyId,
        isSuperAdmin: false,
        hasPermission: () => true,
      };
      try {
        const record = await services.conversations.getConversation(ctx, input.conversationId);
        return {
          id: record.id,
          companyId: record.company_id,
          aiAssistantId: record.ai_assistant_id,
          assignedUserId: record.assigned_user_id,
          customerId: record.customer_id,
          state: record.state,
          metadata: (record.metadata as Record<string, unknown>) ?? {},
          channelType: record.channel_type,
          priority: record.priority ?? "normal",
        };
      } catch {
        return null;
      }
    },
  };
}
