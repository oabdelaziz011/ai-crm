import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffPlatformServices,
  type HandoffPlatformServices,
} from "@workspace/human-handoff-platform";
import type { HandoffAgentToolPorts } from "../tools/handoff-agent-ports.js";

export function createHandoffAgentToolPortsFromPlatform(
  platform: HandoffPlatformServices,
  context: {
    userId: string | null;
    companyId: string;
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  },
): HandoffAgentToolPorts {
  const serviceContext = {
    userId: context.userId,
    companyId: context.companyId,
    isSuperAdmin: context.isSuperAdmin,
    hasPermission: context.hasPermission,
  };

  return {
    async escalateToHuman(input) {
      const result = await platform.commands.escalateConversation(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        triggerCode: input.triggerCode,
        reason: input.reason,
        targetQueueId: input.targetQueueId,
        requestedByAiAssistantId: input.aiAssistantId,
      });
      return {
        ownership: {
          ownerType: result.ownership.ownerType,
          ownerLabel: result.ownership.ownerLabel,
        },
        requestId: result.request.id,
      };
    },

    async queueForHuman(input) {
      const result = await platform.commands.queueConversation(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        queueId: input.queueId,
        reason: input.reason,
        requestedByAiAssistantId: input.aiAssistantId,
      });
      return {
        queuePosition: result.queuePosition.position,
        estimatedWaitSeconds: result.queuePosition.estimatedWaitSeconds,
      };
    },

    async returnToAi(input) {
      const result = await platform.commands.returnConversationToAi(serviceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        reason: input.reason,
      });
      return {
        ownership: { ownerType: result.ownership.ownerType },
      };
    },
  };
}

export function createHandoffAgentToolPorts(client: SupabaseClient): HandoffAgentToolPorts {
  const platform = createHandoffPlatformServices(client);
  return createHandoffAgentToolPortsFromPlatform(platform, {
    userId: null,
    companyId: "",
    isSuperAdmin: false,
    hasPermission: () => true,
  });
}
