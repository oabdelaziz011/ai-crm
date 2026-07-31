import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../../ports/channel-adapter-port.js";
import type {
  ChannelAttachmentDto,
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../../dto/channel-dto.js";
import { AttachmentEngine } from "../../engines/attachment-engine.js";
import { ValidationError } from "../../errors.js";
import { mapMetaMessagingEventsToEnvelopes } from "../meta/meta-messaging-adapter.js";
import { parseMetaMessagingWebhookEvents } from "../meta/meta-messaging-webhook.js";
import { MessengerApiClient } from "./messenger-api-client.js";
import { parseMessengerChannelReferences } from "./messenger-config.js";
import { resolveMessengerRuntimeConfiguration } from "./messenger-canonical-credentials.js";
import type { MessengerCredentialsLoader } from "./messenger-canonical-credentials.js";
import type { MessengerSendMessagePayload, MessengerWebhookMessage } from "./messenger-types.js";

export type MessengerCloudAdapterOptions = {
  fetchFn?: typeof fetch;
  credentialsLoader?: MessengerCredentialsLoader;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
};

export class MessengerCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "messenger";

  private readonly apiClient: MessengerApiClient;
  private readonly attachmentEngine = new AttachmentEngine();
  private readonly credentialsLoader?: MessengerCredentialsLoader;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;

  constructor(options: MessengerCloudAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
    this.apiClient = new MessengerApiClient({
      fetchFn: options.fetchFn,
      onOutboundRequest: (detail) => this.onOutboundDiagnostic?.(detail),
    });
  }

  parseWebhookEvents(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto[] {
    const events = parseMetaMessagingWebhookEvents(rawPayload, "page");
    return mapMetaMessagingEventsToEnvelopes(ctx, this.channelKey, events, "pageId");
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const envelopes = this.parseWebhookEvents(ctx, rawPayload);
    const primary = envelopes[0];
    if (!primary) {
      throw new ValidationError("Messenger webhook payload did not contain routable events.");
    }
    return primary;
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    const postback = payload.postback as { title?: string; payload?: string } | undefined;
    if (postback) {
      const text = postback.title?.trim() || postback.payload?.trim() || "";
      return {
        externalThreadId:
          typeof payload.senderExternalId === "string" ? payload.senderExternalId : "",
        externalMessageId:
          typeof payload.externalMessageId === "string"
            ? payload.externalMessageId
            : `${payload.senderExternalId ?? "unknown"}:postback`,
        senderExternalId:
          typeof payload.senderExternalId === "string" ? payload.senderExternalId : null,
        text,
        attachments: [],
        metadata: {
          kind: "interactive_reply",
          interactionType: "postback",
          replyId: postback.payload,
          title: postback.title,
          pageId: typeof payload.pageId === "string" ? payload.pageId : undefined,
        },
      };
    }

    const message = payload.message as MessengerWebhookMessage | undefined;
    if (!message) {
      throw new ValidationError("Messenger inbound payload missing message object.");
    }

    const { text, attachments } = this.extractMessageContent(message);
    return {
      externalThreadId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : "",
      externalMessageId: message.mid ?? `${payload.senderExternalId ?? "unknown"}:message`,
      senderExternalId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : null,
      text,
      attachments,
      metadata: {
        messengerMessageType: attachments.length > 0 ? attachments[0]?.type ?? "attachment" : "text",
        pageId: typeof payload.pageId === "string" ? payload.pageId : undefined,
      },
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    const attachment = message.attachments?.[0];
    if (attachment?.url) {
      const type =
        attachment.type === "video"
          ? "video"
          : attachment.type === "audio"
            ? "audio"
            : attachment.type === "document"
              ? "file"
              : "image";

      const payload: MessengerSendMessagePayload = {
        recipient: { id: message.externalThreadId },
        messaging_type: "RESPONSE",
        message: {
          attachment: {
            type,
            payload: { url: attachment.url, is_reusable: true },
          },
        },
      };

      return { payload, recipient: message.externalThreadId };
    }

    const payload: MessengerSendMessagePayload = {
      recipient: { id: message.externalThreadId },
      messaging_type: "RESPONSE",
      message: { text: message.text },
    };

    return { payload, recipient: message.externalThreadId };
  }

  async sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.credentialsLoader) {
      throw new ValidationError("Messenger credentials loader is not configured.");
    }

    const channelReferences = parseMessengerChannelReferences(ctx.companyChannel.configuration);
    const runtimeConfig = await resolveMessengerRuntimeConfiguration(
      ctx.companyChannel.companyId,
      channelReferences,
      this.credentialsLoader,
    );

    this.onOutboundDiagnostic?.({
      stage: "outbound.credentials.resolved",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      pageId: runtimeConfig.pageId,
      credentialSource: "company_messenger_settings",
    });

    const payload = formattedPayload.payload as MessengerSendMessagePayload;
    const response = await this.apiClient.sendMessage(runtimeConfig, payload, {
      accessTokenSource: "company_messenger_settings",
    });
    const externalMessageId = response.message_id;

    if (!externalMessageId) {
      throw new ValidationError("Messenger API did not return an outbound message id.");
    }

    return {
      externalMessageId,
      providerResponse: response as unknown as Record<string, unknown>,
    };
  }

  private extractMessageContent(message: MessengerWebhookMessage): {
    text: string;
    attachments: ChannelAttachmentDto[];
  } {
    const text = message.text?.trim() ?? "";
    const attachments: ChannelAttachmentDto[] = [];

    for (const attachment of message.attachments ?? []) {
      const type = attachment.type?.toLowerCase();
      const url = attachment.payload?.url;
      if (!url) continue;

      attachments.push(
        ...this.attachmentEngine.normalizeAttachments([
          {
            type:
              type === "video"
                ? "video"
                : type === "audio"
                  ? "audio"
                  : type === "file"
                    ? "document"
                    : "image",
            url,
            metadata: {
              messengerAttachmentType: attachment.type,
              stickerId: attachment.payload?.sticker_id,
            },
          },
        ]),
      );
    }

    return { text, attachments };
  }
}

export function createMessengerCloudAdapter(options?: MessengerCloudAdapterOptions): MessengerCloudAdapter {
  return new MessengerCloudAdapter(options);
}
