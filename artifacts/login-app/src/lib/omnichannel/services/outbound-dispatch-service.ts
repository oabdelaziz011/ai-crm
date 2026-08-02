import type { OutboundDispatchResponseDto } from "@workspace/channel-platform/client";
import type { ServiceContext } from "@workspace/channel-platform/client";
import type { ChannelDispatcher } from "@workspace/channel-platform/client";
import { requiresServerOutboundDispatch } from "@workspace/channel-platform/client";
import {
  dispatchOmnichannelOutboundViaApi,
  isOmnichannelOutboundApiConfigured,
} from "@/lib/omnichannel/services/omnichannel-outbound-api-client";

export type OutboundDispatchInput = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
  text: string;
  attachments?: Array<{
    attachmentId: string;
    type: "image" | "document" | "audio" | "video" | "text" | "template";
    url?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    metadata?: Record<string, unknown>;
  }>;
  outboundMessageId?: string;
  metadata?: Record<string, unknown>;
  persistConversationMessage?: boolean;
};

export async function dispatchOutboundMessage(
  channelKey: string,
  channelContext: ServiceContext,
  dispatcher: ChannelDispatcher,
  input: OutboundDispatchInput,
): Promise<OutboundDispatchResponseDto> {
  if (requiresServerOutboundDispatch(channelKey)) {
    if (!isOmnichannelOutboundApiConfigured()) {
      throw new Error(
        "Server outbound dispatch is required for this channel but VITE_API_SERVER_URL is not configured.",
      );
    }

    return dispatchOmnichannelOutboundViaApi({
      companyId: input.companyId,
      conversationId: input.conversationId,
      companyChannelId: input.companyChannelId,
      channelKey: input.channelKey,
      channelSessionId: input.channelSessionId,
      externalThreadId: input.externalThreadId,
      text: input.text,
      attachments: input.attachments,
      outboundMessageId: input.outboundMessageId,
      metadata: input.metadata,
      persistConversationMessage: input.persistConversationMessage,
    });
  }

  return dispatcher.dispatch(channelContext, {
    companyId: input.companyId,
    companyChannelId: input.companyChannelId,
    channelKey: input.channelKey,
    conversationId: input.conversationId,
    channelSessionId: input.channelSessionId,
    externalThreadId: input.externalThreadId,
    text: input.text,
    attachments: input.attachments,
    outboundMessageId: input.outboundMessageId,
    metadata: input.metadata,
    persistConversationMessage: input.persistConversationMessage,
  });
}
