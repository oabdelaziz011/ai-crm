import type { WebhookEnvelopeDto } from "../dto/channel-dto.js";

export type WebhookAdapterClassificationLog = {
  event: "channel.adapter.classified";
  channelKey: string;
  requestId: string | null;
  eventType: string;
  parsedEventCount: number;
  externalMessageId: string | null;
  externalThreadId: string | null;
  routesToInboundPipeline: boolean;
  routesToDeliveryStatusPipeline: boolean;
};

export function buildWebhookAdapterClassificationLog(input: {
  channelKey: string;
  requestId?: string | null;
  envelope: WebhookEnvelopeDto;
  parsedEventCount?: number;
}): WebhookAdapterClassificationLog {
  const isDeliveryStatus =
    input.envelope.eventType === "message.status" || input.envelope.eventType === "message.read";

  return {
    event: "channel.adapter.classified",
    channelKey: input.channelKey,
    requestId: input.requestId ?? null,
    eventType: input.envelope.eventType,
    parsedEventCount: input.parsedEventCount ?? 1,
    externalMessageId: input.envelope.externalMessageId ?? null,
    externalThreadId: input.envelope.externalThreadId ?? null,
    routesToInboundPipeline: !isDeliveryStatus,
    routesToDeliveryStatusPipeline: isDeliveryStatus,
  };
}

export function logWebhookAdapterClassification(log: WebhookAdapterClassificationLog): void {
  console.info(JSON.stringify(log));
}
