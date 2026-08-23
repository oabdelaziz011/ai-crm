import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffPlatformServices,
  HANDOFF_PERMISSIONS,
  type HandoffPlatformServices,
  type HandoffServiceContext,
} from "@workspace/human-handoff-platform";
import type { HandoffAgentToolPorts } from "../tools/handoff-agent-ports.js";

/**
 * Domain-layer permissions for AI Employee handoff tools after ToolRouter + commercial gates.
 * Constrained allowlist — not isSuperAdmin and not blanket () => true.
 */
const HANDOFF_AGENT_DOMAIN_PERMISSIONS: ReadonlySet<string> = new Set([
  HANDOFF_PERMISSIONS.escalate,
  HANDOFF_PERMISSIONS.queue,
  HANDOFF_PERMISSIONS.returnToAi,
  HANDOFF_PERMISSIONS.view,
  HANDOFF_PERMISSIONS.transfer,
]);

export type CreateHandoffAgentToolPortsOptions = {
  platform?: HandoffPlatformServices;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

function buildFixedServiceContext(context: {
  userId: string | null;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}): HandoffServiceContext {
  return {
    userId: context.userId,
    companyId: context.companyId,
    isSuperAdmin: context.isSuperAdmin,
    hasPermission: context.hasPermission,
  };
}

function buildWebhookServiceContext(companyId: string, userId: string | null): HandoffServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => HANDOFF_AGENT_DOMAIN_PERMISSIONS.has(code),
  };
}

export function createHandoffAgentToolPortsFromPlatform(
  platform: HandoffPlatformServices,
  context: {
    userId: string | null;
    companyId: string;
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  },
): HandoffAgentToolPorts {
  const serviceContext = buildFixedServiceContext(context);

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

/**
 * Webhook / multi-tenant factory: builds company-scoped service context per call.
 * Product authorization remains ToolRouter + commercial gate + assignment; this layer
 * only satisfies handoff domain company/permission interfaces (isSuperAdmin always false).
 */
export function createHandoffAgentToolPorts(
  client: SupabaseClient,
  options: CreateHandoffAgentToolPortsOptions = {},
): HandoffAgentToolPorts {
  const platform = options.platform ?? createHandoffPlatformServices(client);

  async function resolveServiceContext(companyId: string): Promise<HandoffServiceContext> {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) {
      throw new Error("companyId is required for handoff tools.");
    }
    const userId = options.resolveActorUserIdForCompany
      ? await options.resolveActorUserIdForCompany(normalizedCompanyId)
      : null;
    return buildWebhookServiceContext(normalizedCompanyId, userId);
  }

  return {
    async escalateToHuman(input) {
      const serviceContext = await resolveServiceContext(input.companyId);
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
      const serviceContext = await resolveServiceContext(input.companyId);
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
      const serviceContext = await resolveServiceContext(input.companyId);
      if (!serviceContext.userId?.trim()) {
        throw new Error("Authenticated user is required for this action.");
      }
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
