import { parseWhatsAppWebhookEvents } from "../adapters/whatsapp/whatsapp-api-client.js";
import type { WebhookEnvelopeDto } from "../dto/channel-dto.js";
import { summarizeWhatsAppWebhookPayload } from "../webhooks/webhook-processing-trace.js";
import type { WhatsAppWebhookMessage } from "../adapters/whatsapp/whatsapp-types.js";

export type WhatsAppAdapterClassificationLog = {
  event: "whatsapp.adapter.classified";
  requestId: string | null;
  eventType: string;
  messageCount: number;
  statusCount: number;
  parsedEventKinds: string[];
  primaryParsedKind: string | null;
  senderWaId: string | null;
  messageText: string | null;
  externalMessageId: string | null;
  routesToInboundPipeline: boolean;
  routesToDeliveryStatusPipeline: boolean;
};

function readMessagePreview(message: WhatsAppWebhookMessage | undefined): string | null {
  if (!message) return null;
  if (message.type === "text") return message.text?.body?.trim() || null;
  if (message.type === "interactive") {
    const listReply = message.interactive?.list_reply;
    const buttonReply = message.interactive?.button_reply;
    return (
      listReply?.title?.trim() ||
      buttonReply?.title?.trim() ||
      listReply?.id?.trim() ||
      buttonReply?.id?.trim() ||
      null
    );
  }
  if (message.type === "button") {
    return message.button?.text?.trim() || message.button?.payload?.trim() || null;
  }
  return null;
}

export function buildWhatsAppAdapterClassificationLog(input: {
  requestId?: string | null;
  rawPayload: Record<string, unknown>;
  envelope: WebhookEnvelopeDto;
}): WhatsAppAdapterClassificationLog {
  const summary = summarizeWhatsAppWebhookPayload(input.rawPayload);
  const parsedEvents = parseWhatsAppWebhookEvents(input.rawPayload);
  const message = input.envelope.payload.message as WhatsAppWebhookMessage | undefined;
  const isDeliveryStatus =
    input.envelope.eventType === "message.status" || input.envelope.eventType === "message.read";

  return {
    event: "whatsapp.adapter.classified",
    requestId: input.requestId ?? null,
    eventType: input.envelope.eventType,
    messageCount: typeof summary.messageCount === "number" ? summary.messageCount : 0,
    statusCount: typeof summary.statusCount === "number" ? summary.statusCount : 0,
    parsedEventKinds: parsedEvents.map((entry) => entry.kind),
    primaryParsedKind: parsedEvents[0]?.kind ?? null,
    senderWaId:
      typeof input.envelope.payload.senderExternalId === "string"
        ? input.envelope.payload.senderExternalId
        : message?.from ?? input.envelope.externalThreadId ?? null,
    messageText: readMessagePreview(message),
    externalMessageId: input.envelope.externalMessageId ?? null,
    routesToInboundPipeline: !isDeliveryStatus,
    routesToDeliveryStatusPipeline: isDeliveryStatus,
  };
}

export function logWhatsAppAdapterClassification(log: WhatsAppAdapterClassificationLog): void {
  console.info(JSON.stringify(log));
}
