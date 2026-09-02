import type { ChannelDispatcher } from "@workspace/channel-platform/client";
import type { ServiceContext } from "@workspace/channel-platform/client";
import { dispatchOutboundMessage } from "@/lib/omnichannel/services/outbound-dispatch-service";
import type {
  CampaignChannelOutboundPort,
  CampaignChannelOutboundRequest,
  CampaignChannelOutboundResult,
} from "./channel-outbound-port";

/**
 * Production Campaign → channel-platform outbound bridge.
 * Reuses dispatchOutboundMessage / ChannelDispatcher — never adapters/Meta.
 */
export function createChannelPlatformCampaignOutboundPort(input: {
  channelContext: ServiceContext;
  dispatcher: ChannelDispatcher;
}): CampaignChannelOutboundPort {
  return {
    async dispatch(request: CampaignChannelOutboundRequest): Promise<CampaignChannelOutboundResult> {
      const result = await dispatchOutboundMessage(
        request.channelKey,
        input.channelContext,
        input.dispatcher,
        {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          conversationId: request.conversationId,
          channelSessionId: request.channelSessionId,
          externalThreadId: request.externalThreadId,
          text: request.text,
          metadata: request.metadata,
          persistConversationMessage: true,
        },
      );

      return {
        deliveryEventId: result.deliveryEventId,
        deliveryStatus: result.deliveryStatus,
        externalMessageId: result.externalMessageId ?? null,
      };
    },
  };
}
