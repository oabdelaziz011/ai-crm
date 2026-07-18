import { randomUUID } from "@workspace/platform-crypto";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";

function readString(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

/** Stub adapter for web chat and E2E verification — no external provider SDK. */
export class StubWebChatAdapter implements ChannelAdapterPort {
  readonly channelKey = "web_chat";

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: ctx.companyChannel.id,
      channelKey: this.channelKey,
      idempotencyKey: readString(rawPayload, "idempotencyKey", randomUUID()),
      externalThreadId: readString(rawPayload, "externalThreadId", randomUUID()),
      externalMessageId: readString(rawPayload, "externalMessageId") || undefined,
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    const text = readString(payload, "text");
    const externalThreadId = readString(payload, "externalThreadId");
    const externalMessageId = readString(payload, "externalMessageId", randomUUID());

    return {
      externalThreadId,
      externalMessageId,
      senderExternalId: readString(payload, "senderExternalId") || null,
      text,
      attachments: [],
      metadata: typeof payload.metadata === "object" && payload.metadata ? (payload.metadata as Record<string, unknown>) : {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return {
      channelKey: this.channelKey,
      externalThreadId: message.externalThreadId,
      text: message.text,
      attachments: message.attachments ?? [],
      metadata: message.metadata ?? {},
    };
  }

  async sendOutbound(
    _ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    return {
      externalMessageId: randomUUID(),
      providerResponse: {
        channelKey: this.channelKey,
        delivered: true,
        payload: formattedPayload,
      },
    };
  }
}

export function createStubWebChatAdapter(): StubWebChatAdapter {
  return new StubWebChatAdapter();
}
