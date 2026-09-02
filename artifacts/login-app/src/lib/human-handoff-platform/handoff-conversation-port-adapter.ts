import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createConversationServices,
  type ServiceContext,
} from "@workspace/ai-conversation";
import type { HandoffConversationPort } from "@workspace/human-handoff-platform";
import {
  readLifecycleOverlay,
  writeLifecycleOverlay,
} from "@/lib/conversation-lifecycle/adapters/backend-state-adapter";

function handoffConversationContext(companyId: string, userId: string | null): ServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

export function createLoginAppHandoffConversationPort(
  client: SupabaseClient,
): HandoffConversationPort {
  const services = createConversationServices(client);

  return {
    async assignConversation(input) {
      const ctx = handoffConversationContext(input.companyId, input.actorUserId);
      await services.conversations.assignConversation(ctx, {
        conversationId: input.conversationId,
        assignedUserId: input.assignedUserId,
      });

      // Keep lifecycle overlay in sync so Omnichannel Owner chip is not stuck on AI Employee.
      try {
        const record = await services.conversations.getConversation(ctx, input.conversationId);
        const metadata = (record.metadata as Record<string, unknown>) ?? {};
        const overlay = readLifecycleOverlay(metadata);
        const nextMetadata = writeLifecycleOverlay(metadata, {
          state: "ASSIGNED",
          owner: {
            kind: "user",
            id: input.assignedUserId,
            label:
              overlay?.owner?.kind === "user" && overlay.owner.id === input.assignedUserId
                ? overlay.owner.label
                : input.assignedUserId,
          },
          queueId: null,
          escalations: overlay?.escalations ?? [],
          timelineEvents: overlay?.timelineEvents ?? [],
          assignmentHistory: overlay?.assignmentHistory ?? [],
          migratedAt: overlay?.migratedAt,
          migrationVersion: overlay?.migrationVersion,
        });
        await services.conversations.updateMetadata(ctx, {
          conversationId: input.conversationId,
          metadata: nextMetadata,
        });
      } catch (error) {
        console.error("[handoff-conversation-port] lifecycle overlay sync failed", {
          conversationId: input.conversationId,
          error,
        });
      }
    },

    async releaseConversation(input) {
      const ctx = handoffConversationContext(input.companyId, input.actorUserId);
      await services.conversations.releaseConversation(ctx, {
        conversationId: input.conversationId,
      });
    },

    async closeConversation(input) {
      const ctx = handoffConversationContext(input.companyId, input.actorUserId);
      await services.conversations.closeConversation(ctx, {
        conversationId: input.conversationId,
      });
    },

    async updateMetadata(input) {
      const ctx = handoffConversationContext(input.companyId, null);
      await services.conversations.updateMetadata(ctx, {
        conversationId: input.conversationId,
        metadata: input.metadata,
      });
    },

    async getConversation(input) {
      const ctx = handoffConversationContext(input.companyId, null);
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
