import type { ServiceContext } from "@workspace/agent-runtime";
import { createAgentRuntimeServices } from "@workspace/agent-runtime";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { useToolRouterServices } from "@/lib/ai-tool-router";
import { useChannelPlatformServices } from "@/lib/channel-platform";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useWebChatCompanyChannel } from "@/hooks/ai-chat/use-web-chat-company-channel";

export function useAgentRuntimeServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: toolRouterServices, context: toolRouterContext } = useToolRouterServices();
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
    }),
    [user?.id, companyId, isSuperAdmin, hasPermission],
  );

  const services = useMemo(() => {
    return createAgentRuntimeServices(supabase, {
      toolRouter: {
        async route(ctx, input) {
          const result = await toolRouterServices.router.route(toolRouterContext, {
            conversationId: input.conversationId,
            toolKey: input.toolKey,
            input: input.input,
            triggeredBy: "agent",
          });
          return {
            executionId: result.executionId,
            status: result.status,
            output: result.output,
            errorMessage: result.errorMessage,
          };
        },
      },
      runtimeChat: {
        async execute(ctx, input) {
          if (!webChatChannel?.id || !runtimeConfig?.providerConnectionId) {
            return { responseContent: `[Simulated] ${input.messageText}` };
          }
          const response = await channelServices.router.routeInbound(channelContext, {
            companyId: input.companyId,
            companyChannelId: webChatChannel.id,
            channelKey: "web_chat",
            source: "direct",
            externalThreadId: input.conversationId,
            conversationId: input.conversationId,
            payload: { text: input.messageText, externalThreadId: input.conversationId },
            executeAi: true,
            runtimeConfig: {
              providerConnectionId: runtimeConfig.providerConnectionId,
              pageContext: input.pageContext,
              executionPolicy: { streaming: false },
            },
          });
          return { responseContent: response.responseContent ?? "" };
        },
      },
    });
  }, [
    toolRouterServices.router,
    toolRouterContext,
    channelServices.router,
    channelContext,
    webChatChannel?.id,
    runtimeConfig?.providerConnectionId,
  ]);

  return { services, context };
}
