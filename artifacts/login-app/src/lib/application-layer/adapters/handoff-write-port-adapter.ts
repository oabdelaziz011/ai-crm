import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandoffWritePort } from "@workspace/application-layer";
import { getLoginAppHandoffPlatformServices } from "@/lib/human-handoff-platform/handoff-read-port-adapter";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function serviceContext(ctx: LoginAppPortContext, tenantId: string) {
  return {
    userId: ctx.actorUserId,
    companyId: tenantId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  };
}

export function createLoginAppHandoffWritePort(client: SupabaseClient, ctx: LoginAppPortContext): HandoffWritePort {
  const platform = getLoginAppHandoffPlatformServices(client);

  return {
    async escalateToHuman(input) {
      const result = await platform.commands.escalateConversation(serviceContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        conversationId: input.conversationId,
        triggerCode: input.triggerCode,
        reason: input.reason,
        targetQueueId: input.targetQueueId,
        requestedByAiAssistantId: input.aiAssistantId,
      });
      return {
        requestId: result.request.id,
        ownership: {
          ownerType: result.ownership.ownerType,
          ownerLabel: result.ownership.ownerLabel,
        },
      };
    },
    async queueForHuman(input) {
      const result = await platform.commands.queueConversation(serviceContext(ctx, input.tenantId), {
        companyId: input.tenantId,
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
      const result = await platform.commands.returnConversationToAi(serviceContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        conversationId: input.conversationId,
        reason: input.reason,
      });
      return {
        ownership: { ownerType: result.ownership.ownerType },
      };
    },
  };
}
