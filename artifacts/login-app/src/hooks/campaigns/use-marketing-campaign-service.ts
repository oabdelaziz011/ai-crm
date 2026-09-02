import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  MarketingCampaignService,
  createChannelPlatformCampaignOutboundPort,
} from "@/lib/campaigns";
import { createCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";
import { useChannelPlatformServices } from "@/lib/channel-platform";

/** Shared campaign service instance for hooks (WhatsApp dispatcher + optional Meta outbound). */
export function useMarketingCampaignService(): MarketingCampaignService {
  const { services, context } = useChannelPlatformServices();

  return useMemo(() => {
    const channelOutbound =
      services?.dispatcher && context
        ? createChannelPlatformCampaignOutboundPort({
            channelContext: context,
            dispatcher: services.dispatcher,
          })
        : null;

    return new MarketingCampaignService(
      supabase,
      (client) => createCommunicationPlatform(client).dispatcher,
      { channelOutbound },
    );
  }, [services?.dispatcher, context]);
}
