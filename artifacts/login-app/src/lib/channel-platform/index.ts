import { createChannelPlatformServices } from "@workspace/channel-platform/client";
import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { useConversationServices } from "@/lib/ai-conversation";
import { useChannelRegistryServices } from "@/lib/channel-registry";
import { useRuntimeIntegrationServices } from "@/lib/runtime-integration";
import { supabase } from "@/lib/supabase";
import { createChannelPlatformPortsWithContext } from "./platform-ports";

/**
 * Factory hook for Enterprise Channel Platform services.
 * All inbound events route through ChannelRouter; outbound through ChannelDispatcher.
 */
export function useChannelPlatformServices() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { services: channelRegistryServices, context: channelRegistryContext } = useChannelRegistryServices();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { services: runtimeServices, context: runtimeContext } = useRuntimeIntegrationServices();

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
    () =>
      createChannelPlatformPortsWithContext(
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
        },
      ),
    [
      channelRegistryServices,
      channelRegistryContext,
      conversationContext,
      conversationServices,
      profile?.company_id,
      runtimeContext,
      runtimeServices,
      user?.id,
    ],
  );

  const services = useMemo(
    () => createChannelPlatformServices(supabase, { ports }),
    [ports],
  );

  return { services, context: platformContext };
}

export * from "./platform-ports";
