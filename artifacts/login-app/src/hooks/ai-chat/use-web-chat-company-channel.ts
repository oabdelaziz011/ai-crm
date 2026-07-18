import { useQuery } from "@tanstack/react-query";
import { useChannelRegistryServices } from "@/lib/channel-registry";

export function webChatCompanyChannelQueryKey(companyId: string | null) {
  return ["web-chat-company-channel", companyId] as const;
}

/**
 * Resolves the enabled web_chat company channel for routing through the Channel Platform.
 */
export function useWebChatCompanyChannel(companyId: string | null) {
  const { services, context } = useChannelRegistryServices();

  return useQuery({
    queryKey: webChatCompanyChannelQueryKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return null;

      const channels = await services.companyChannels.listCompanyChannels(context, {
        companyId,
        channelKey: "web_chat",
        isEnabled: true,
      });

      return channels.find((channel) => channel.is_default) ?? channels[0] ?? null;
    },
  });
}
