import { createChannelPlatformServices } from "@workspace/channel-platform/client";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useConversationServices } from "@/lib/ai-conversation";
import { useChannelRegistryServices } from "@/lib/channel-registry";
import { useRuntimeIntegrationServices } from "@/lib/runtime-integration";
import { useAIExecutionServices } from "@/lib/ai-execution-engine";
import { useUnifiedAIRuntime } from "@/lib/application-layer/use-unified-ai-runtime";
import { supabase } from "@/lib/supabase";
import { createChannelPlatformPortsWithContext } from "./platform-ports";
import { createSupabaseInboundAiGatePort } from "@workspace/human-handoff-platform";

/**
 * Factory hook for Enterprise Channel Platform services.
 * All inbound AI events route through AIApplicationService unified runtime entry.
 */
export function useChannelPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: channelRegistryServices, context: channelRegistryContext } = useChannelRegistryServices();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { services: runtimeServices, context: runtimeContext } = useRuntimeIntegrationServices();
  const { services: executionServices } = useAIExecutionServices();
  const { execute: unifiedExecute, runtimeContext: unifiedRuntimeContext } = useUnifiedAIRuntime(
    runtimeServices,
    executionServices,
  );

  const platformContext = useMemo(
    () => ({
      userId: user?.id ?? null,
      companyId: profile?.company_id ?? null,
      isSuperAdmin,
      hasPermission,
    }),
    [user?.id, profile?.company_id, isSuperAdmin, hasPermission],
  );

  const ports = useMemo(
    () => {
      const next = createChannelPlatformPortsWithContext(
        {
          channelRegistry: channelRegistryServices,
          conversation: conversationServices,
          runtime: runtimeServices,
          supabaseClient: supabase,
        },
        {
          registry: channelRegistryContext,
          conversation: conversationContext,
          runtime: runtimeContext,
        },
        {
          resolveRuntimeActorUserId: async (companyId) => {
            if (user?.id && profile?.company_id === companyId) {
              return user.id;
            }
            return null;
          },
          unifiedExecute: async (runtimeCtx, input) => {
            const response = await unifiedExecute(
              {
                companyId: input.companyId,
                conversationId: input.conversationId,
                messageText: input.messageText,
                pageContext: input.pageContext,
                correlationId: input.correlationId,
                providerConnectionId: input.providerConnectionId,
                knowledgeRetrieval: input.knowledgeRetrieval,
                executionPolicy: input.executionPolicy,
                onStreamChunk: input.onStreamChunk,
                abortSignal: input.abortSignal,
              },
              undefined,
            );
            return {
              executionId: response.executionId,
              responseContent: response.responseContent,
              correlationId: response.correlationId,
            };
          },
        },
      );

      next.inboundAutomationGate = createSupabaseInboundAiGatePort(supabase, {
        getConversation: async (companyId, conversationId) => {
          try {
            const record = await conversationServices.conversations.getConversation(
              conversationContext,
              conversationId,
            );
            if (record.company_id !== companyId) return null;
            return {
              assignedUserId: record.assigned_user_id ?? null,
              state: record.state ?? null,
            };
          } catch {
            return null;
          }
        },
      });

      return next;
    },
    [
      channelRegistryServices,
      channelRegistryContext,
      conversationContext,
      conversationServices,
      profile?.company_id,
      runtimeContext,
      runtimeServices,
      unifiedExecute,
      user?.id,
    ],
  );

  const services = useMemo(
    () => createChannelPlatformServices(supabase, { ports, browserSafeOutbound: true }),
    [ports],
  );

  return { services, context: platformContext, unifiedRuntimeContext };
}

export * from "./platform-ports";
