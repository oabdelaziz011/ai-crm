import { useMemo } from "react";
import type { ServiceContext } from "@workspace/agent-runtime";
import { createAgentRuntimeServices } from "@workspace/agent-runtime";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useAgentsFeatureEnabled } from "@/hooks/platform-ai/use-platform-ai-feature-enabled";
import { supabase } from "@/lib/supabase";
import { useToolRouterServices } from "@/lib/ai-tool-router";
import { useChannelPlatformServices } from "@/lib/channel-platform";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useWebChatCompanyChannel } from "@/hooks/ai-chat/use-web-chat-company-channel";
import { createAgentKnowledgeRetrievalPort } from "@/lib/agent-runtime/knowledge-retrieval-port";
import {
  buildChannelRuntimeConfigFromExecutionContext,
  readAgentEmployeeExecutionContext,
} from "@/lib/ai-employees/utilities/agent-employee-execution-context";
import { applyToolScopeBeforeRoute } from "@/lib/ai-employees/utilities/scoped-runtime-tool-port";
import { runWithEmployeeToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";

export function useAgentRuntimeServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { isEnabled: agentsFeatureEnabled } = useAgentsFeatureEnabled();
  const { services: toolRouterServices, context: toolRouterContext } = useToolRouterServices();
  const { services: retrievalServices, context: retrievalContext } = useRetrievalServices();
  const { services: channelServices, context: channelContext } = useChannelPlatformServices();
  const companyId = profile?.company_id ?? null;
  const { data: runtimeConfig } = useRuntimeChatConfig(companyId, false, undefined);
  const { data: webChatChannel } = useWebChatCompanyChannel(companyId);

  const context = useMemo<ServiceContext>(
    () => ({
      userId: user?.id ?? null,
      companyId,
      isSuperAdmin,
      hasPermission,
      isAgentsFeatureEnabled: () => agentsFeatureEnabled,
    }),
    [user?.id, companyId, isSuperAdmin, hasPermission, agentsFeatureEnabled],
  );

  const services = useMemo(() => {
    const knowledgeConfig = runtimeConfig?.knowledgeRetrieval;
    const knowledgeRetrieval =
      knowledgeConfig?.embeddingConnectionId &&
      knowledgeConfig.vectorStoreConnectionId &&
      knowledgeConfig.collectionId
        ? createAgentKnowledgeRetrievalPort({
            resolveConfig: async () => ({
              embeddingConnectionId: knowledgeConfig.embeddingConnectionId,
              vectorStoreConnectionId: knowledgeConfig.vectorStoreConnectionId,
              collectionId: knowledgeConfig.collectionId,
            }),
            retrieve: async (_ctx, input) =>
              retrievalServices.knowledge.retrieve(retrievalContext, {
                companyId: input.companyId,
                question: input.question,
                embeddingConnectionId: input.embeddingConnectionId!,
                vectorStoreConnectionId: input.vectorStoreConnectionId!,
                collectionId: input.collectionId!,
                searchMode: input.searchMode ?? "hybrid",
                metadataFilters: input.metadataFilters,
                sourceIds: input.sourceIds,
                documentIds: input.documentIds,
                rerank: input.rerank ?? true,
              }),
          })
        : undefined;

    return createAgentRuntimeServices(supabase, {
      toolRouter: {
        async getRequiredPermissions(toolKey) {
          return toolRouterServices.registry.resolveRequiredPermissions(toolKey);
        },
        async route(ctx, input) {
          const result = await applyToolScopeBeforeRoute(
            {
              route: async (_ctx, routeInput) => {
                const routed = await toolRouterServices.router.route(toolRouterContext, {
                  conversationId: routeInput.conversationId,
                  toolKey: routeInput.toolKey,
                  input: routeInput.input,
                  triggeredBy: "agent",
                });
                return {
                  executionId: routed.executionId,
                  toolKey: routed.toolKey ?? routeInput.toolKey,
                  status: routed.status,
                  output: routed.output,
                  durationMs: routed.durationMs,
                  errorCode: routed.errorCode,
                  errorMessage: routed.errorMessage,
                };
              },
            },
            ctx,
            input,
          );
          return {
            executionId: result.executionId,
            status: result.status,
            output: result.output,
            errorMessage: result.errorMessage,
            errorCode: result.errorCode,
          };
        },
      },
      knowledgeRetrieval,
      runtimeChat: {
        async execute(ctx, input) {
          if (!webChatChannel?.id) {
            return { responseContent: `[Simulated] ${input.messageText}` };
          }

          const executionContext = readAgentEmployeeExecutionContext(input.pageContext);
          const providerConnectionId =
            executionContext?.providerConnectionId ?? runtimeConfig?.providerConnectionId ?? null;

          if (!providerConnectionId) {
            return { responseContent: `[Simulated] ${input.messageText}` };
          }

          const runtimeConfigPayload = executionContext
            ? buildChannelRuntimeConfigFromExecutionContext(
                executionContext,
                input.pageContext ?? {},
              )
            : {
                providerConnectionId,
                pageContext: input.pageContext,
                knowledgeRetrieval:
                  runtimeConfig?.knowledgeRetrieval?.embeddingConnectionId &&
                  runtimeConfig.knowledgeRetrieval.vectorStoreConnectionId &&
                  runtimeConfig.knowledgeRetrieval.collectionId
                    ? {
                        embeddingConnectionId: runtimeConfig.knowledgeRetrieval.embeddingConnectionId,
                        vectorStoreConnectionId: runtimeConfig.knowledgeRetrieval.vectorStoreConnectionId,
                        collectionId: runtimeConfig.knowledgeRetrieval.collectionId,
                      }
                    : undefined,
                executionPolicy: { streaming: false },
              };

          const executeChannelRuntime = async () =>
            channelServices.router.routeInbound(channelContext, {
              companyId: input.companyId,
              companyChannelId: webChatChannel.id,
              channelKey: "web_chat",
              source: "direct",
              externalThreadId: input.conversationId,
              conversationId: input.conversationId,
              payload: { text: input.messageText, externalThreadId: input.conversationId },
              executeAi: true,
              runtimeConfig: runtimeConfigPayload,
            });

          const response = executionContext
            ? await runWithEmployeeToolScope(
                {
                  allowedToolKeys: executionContext.allowedToolKeys,
                  employeeId: executionContext.aiEmployeeId,
                },
                executeChannelRuntime,
              )
            : await executeChannelRuntime();

          return { responseContent: response.responseContent ?? "" };
        },
      },
    });
  }, [
    toolRouterServices.router,
    toolRouterContext,
    retrievalServices.knowledge,
    retrievalContext,
    channelServices.router,
    channelContext,
    webChatChannel?.id,
    runtimeConfig?.providerConnectionId,
    runtimeConfig?.knowledgeRetrieval?.collectionId,
    runtimeConfig?.knowledgeRetrieval?.embeddingConnectionId,
    runtimeConfig?.knowledgeRetrieval?.vectorStoreConnectionId,
  ]);

  return { services, context };
}
