import type { MetaMessagingChannelKey } from "./thread-eligibility";

export type CampaignChannelOutboundRequest = {
  companyId: string;
  companyChannelId: string;
  channelKey: MetaMessagingChannelKey;
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type CampaignChannelOutboundResult = {
  deliveryEventId: string;
  deliveryStatus: string;
  externalMessageId?: string | null;
};

/**
 * Facade port over existing ChannelDispatcher / server outbound API.
 * Campaign domain must never call Instagram/Messenger adapters directly.
 */
export type CampaignChannelOutboundPort = {
  dispatch(request: CampaignChannelOutboundRequest): Promise<CampaignChannelOutboundResult>;
};

export function mapChannelOutboundToRecipientOutcome(
  result: CampaignChannelOutboundResult | null,
): {
  status: "sent" | "failed";
  channel_delivery_event_id: string | null;
  provider_message_id: string | null;
  error_message: string | null;
} {
  if (!result) {
    return {
      status: "failed",
      channel_delivery_event_id: null,
      provider_message_id: null,
      error_message: "channel_outbound_unavailable",
    };
  }

  const status = String(result.deliveryStatus ?? "").toLowerCase();
  const deliveryEventId = result.deliveryEventId?.trim() || null;
  const externalId = result.externalMessageId?.trim() || null;

  if (status === "failed") {
    return {
      status: "failed",
      channel_delivery_event_id: deliveryEventId,
      provider_message_id: externalId,
      error_message: "channel_outbound_failed",
    };
  }

  // OutboundMessagePipeline marks Graph accept as "sent" (and later may move to delivered/read).
  if (status === "sent" || status === "delivered" || status === "read") {
    return {
      status: "sent",
      channel_delivery_event_id: deliveryEventId,
      provider_message_id: externalId,
      error_message: null,
    };
  }

  return {
    status: "failed",
    channel_delivery_event_id: deliveryEventId,
    provider_message_id: externalId,
    error_message: `unexpected_delivery_status:${status || "unknown"}`,
  };
}

/** Minimum Campaign-side batching for synchronous Meta messaging sends. */
export const META_MESSAGING_CAMPAIGN_BATCH_SIZE = 10;
export const META_MESSAGING_CAMPAIGN_BATCH_PAUSE_MS = 50;

export async function runInBatches<T>(
  items: T[],
  batchSize: number,
  pauseMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    for (const item of slice) {
      await worker(item);
    }
    if (i + batchSize < items.length && pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}
