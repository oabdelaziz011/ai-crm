import type { ChannelAdapterContext } from "../../ports/channel-adapter-port.js";
import type { WebhookEnvelopeDto } from "../../dto/channel-dto.js";
import type { ParsedMetaMessagingWebhookEvent } from "./meta-messaging-webhook.js";

export function mapMetaMessagingEventToEnvelope(
  ctx: ChannelAdapterContext,
  channelKey: string,
  event: ParsedMetaMessagingWebhookEvent,
  accountIdField: "instagramBusinessAccountId" | "pageId",
): WebhookEnvelopeDto {
  if (event.kind === "status") {
    return {
      eventType: event.status === "read" ? "message.read" : "message.status",
      companyChannelId: ctx.companyChannel.id,
      channelKey,
      idempotencyKey: event.idempotencyKey,
      externalThreadId: event.externalThreadId ?? "",
      externalMessageId: event.externalMessageId,
      payload: {
        deliveryStatus: event.status,
        providerResponse: event.providerResponse,
        errorMessage: event.errorMessage,
        raw: event.raw,
      },
    };
  }

  if (event.kind === "postback") {
    return {
      eventType: "message.received",
      companyChannelId: ctx.companyChannel.id,
      channelKey,
      idempotencyKey: event.idempotencyKey,
      externalThreadId: event.externalThreadId,
      externalMessageId: event.externalMessageId,
      payload: {
        postback: event.postback,
        senderExternalId: event.senderExternalId,
        [accountIdField]: event.accountId,
        raw: event.raw,
      },
    };
  }

  return {
    eventType: "message.received",
    companyChannelId: ctx.companyChannel.id,
    channelKey,
    idempotencyKey: event.idempotencyKey,
    externalThreadId: event.externalThreadId,
    externalMessageId: event.externalMessageId,
    payload: {
      message: event.message,
      senderExternalId: event.senderExternalId,
      [accountIdField]: event.accountId,
      raw: event.raw,
    },
  };
}

export function mapMetaMessagingEventsToEnvelopes(
  ctx: ChannelAdapterContext,
  channelKey: string,
  events: ParsedMetaMessagingWebhookEvent[],
  accountIdField: "instagramBusinessAccountId" | "pageId",
): WebhookEnvelopeDto[] {
  return events.map((event) => mapMetaMessagingEventToEnvelope(ctx, channelKey, event, accountIdField));
}
