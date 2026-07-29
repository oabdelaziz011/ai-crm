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
import {
  InstagramApiClient,
} from "./instagram-api-client.js";
import { mapMetaMessagingEventsToEnvelopes } from "../meta/meta-messaging-adapter.js";
import { parseMetaMessagingWebhookEvents } from "../meta/meta-messaging-webhook.js";
import { parseInstagramChannelReferences } from "./instagram-config.js";
import { resolveInstagramRuntimeConfiguration } from "./instagram-canonical-credentials.js";
import type { InstagramCredentialsLoader } from "./instagram-canonical-credentials.js";
import type { InstagramSendMessagePayload, InstagramWebhookMessage } from "./instagram-types.js";

export type InstagramCloudAdapterOptions = {
  fetchFn?: typeof fetch;
  credentialsLoader?: InstagramCredentialsLoader;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
};

export class InstagramCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "instagram";

  private readonly apiClient: InstagramApiClient;
  private readonly attachmentEngine = new AttachmentEngine();
  private readonly credentialsLoader?: InstagramCredentialsLoader;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;

  constructor(options: InstagramCloudAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
    this.apiClient = new InstagramApiClient({
      fetchFn: options.fetchFn,
      onOutboundRequest: (detail) => this.onOutboundDiagnostic?.(detail),
    });
  }

  parseWebhookEvents(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto[] {
    const events = parseMetaMessagingWebhookEvents(rawPayload, "instagram");
    return mapMetaMessagingEventsToEnvelopes(ctx, this.channelKey, events, "instagramBusinessAccountId");
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const envelopes = this.parseWebhookEvents(ctx, rawPayload);
    const primary = envelopes[0];
    if (!primary) {
      throw new ValidationError("Instagram webhook payload did not contain routable events.");
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
          typeof payload.senderExternalId === "string" ? payload.senderExternalId : undefined,
        text,
        attachments: [],
        metadata: {
          kind: "interactive_reply",
          interactionType: "postback",
          replyId: postback.payload,
          title: postback.title,
          instagramBusinessAccountId:
            typeof payload.instagramBusinessAccountId === "string"
              ? payload.instagramBusinessAccountId
              : undefined,
        },
      };
    }

    const message = payload.message as InstagramWebhookMessage | undefined;
    if (!message) {
      throw new ValidationError("Instagram inbound payload missing message object.");
    }

    const { text, attachments } = this.extractMessageContent(message);
    const metadata: Record<string, unknown> = {
      instagramMessageType: attachments.length > 0 ? attachments[0]?.type ?? "attachment" : "text",
      senderExternalId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : undefined,
      instagramBusinessAccountId:
        typeof payload.instagramBusinessAccountId === "string"
          ? payload.instagramBusinessAccountId
          : undefined,
    };

    return {
      externalThreadId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : "",
      externalMessageId: message.mid,
      senderExternalId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : undefined,
      text,
      attachments,
      metadata,
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

      const payload: InstagramSendMessagePayload = {
        recipient: { id: message.externalThreadId },
        message: {
          attachment: {
            type,
            payload: { url: attachment.url, is_reusable: true },
          },
        },
      };

      if (message.text.trim()) {
        payload.message.text = message.text;
      }

      return { payload, recipient: message.externalThreadId };
    }

    const payload: InstagramSendMessagePayload = {
      recipient: { id: message.externalThreadId },
      message: { text: message.text },
    };

    return { payload, recipient: message.externalThreadId };
  }

  async sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.credentialsLoader) {
      throw new ValidationError("Instagram credentials loader is not configured.");
    }

    const channelReferences = parseInstagramChannelReferences(ctx.companyChannel.configuration);
    const runtimeConfig = await resolveInstagramRuntimeConfiguration(
      ctx.companyChannel.companyId,
      channelReferences,
      this.credentialsLoader,
    );

    this.onOutboundDiagnostic?.({
      stage: "outbound.credentials.resolved",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      instagramBusinessAccountId: runtimeConfig.instagramBusinessAccountId,
      credentialSource: "company_instagram_settings",
    });

    const payload = formattedPayload.payload as InstagramSendMessagePayload;
    const response = await this.apiClient.sendMessage(runtimeConfig, payload, {
      accessTokenSource: "company_instagram_settings",
    });
    const externalMessageId = response.message_id;

    if (!externalMessageId) {
      throw new ValidationError("Instagram API did not return an outbound message id.");
    }

    return {
      externalMessageId,
      providerResponse: response as unknown as Record<string, unknown>,
    };
  }

  private extractMessageContent(message: InstagramWebhookMessage): {
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
              instagramAttachmentType: attachment.type,
              stickerId: attachment.payload?.sticker_id,
            },
          },
        ]),
      );
    }

    return { text, attachments };
  }
}

export function createInstagramCloudAdapter(options?: InstagramCloudAdapterOptions): InstagramCloudAdapter {
  return new InstagramCloudAdapter(options);
}
