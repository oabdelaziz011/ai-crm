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
import type {
  InstagramSendMessagePayload,
  InstagramWebhookMessage,
} from "./instagram-types.js";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractInstagramGenericElementText(message: InstagramWebhookMessage): string {
  const parts: string[] = [];

  for (const attachment of message.attachments ?? []) {
    for (const element of attachment.payload?.generic?.elements ?? []) {
      const title = readTrimmedString(element.title);
      const subtitle = readTrimmedString(element.subtitle);
      if (title) parts.push(title);
      if (subtitle) parts.push(subtitle);
      for (const button of element.buttons ?? []) {
        const buttonTitle = readTrimmedString(button.title);
        if (buttonTitle) parts.push(buttonTitle);
      }
    }
  }

  return parts.join("\n");
}

function extractInstagramQuickReplyText(message: InstagramWebhookMessage): string {
  const quickReply = message.quick_reply;
  if (!quickReply) return "";
  return readTrimmedString(quickReply.title) || readTrimmedString(quickReply.payload);
}

function instagramMessageHasUsableMediaUrl(message: InstagramWebhookMessage): boolean {
  return (message.attachments ?? []).some((attachment) =>
    Boolean(readTrimmedString(attachment.payload?.url)),
  );
}

function instagramMessageHasInboundContent(message: InstagramWebhookMessage): boolean {
  if (readTrimmedString(message.text)) return true;
  if (instagramMessageHasUsableMediaUrl(message)) return true;
  if (extractInstagramGenericElementText(message)) return true;
  if (extractInstagramQuickReplyText(message)) return true;
  return false;
}

function resolveInstagramMessageType(
  message: InstagramWebhookMessage,
  mediaAttachments: ChannelAttachmentDto[],
): string {
  if (message.is_unsupported === true) return "unsupported";
  if (mediaAttachments.length > 0) {
    return mediaAttachments[0]?.type ?? "attachment";
  }
  const hasTemplate = (message.attachments ?? []).some(
    (attachment) => attachment.type?.toLowerCase() === "template",
  );
  if (hasTemplate) return "template";
  if (readTrimmedString(message.text)) return "text";
  if (extractInstagramQuickReplyText(message)) return "quick_reply";
  return "empty";
}

function readStructuredOutboundPayload(
  message: OutboundChannelMessageDto,
): Record<string, unknown> | null {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const payload = (metadata as { outboundPayload?: unknown }).outboundPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function readInstagramChoiceLabels(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const labels: string[] = [];

  if (Array.isArray(payload.buttons)) {
    for (const entry of payload.buttons) {
      if (!entry || typeof entry !== "object") continue;
      const label = readTrimmedString((entry as { label?: unknown }).label);
      if (label) labels.push(label);
    }
  }

  if (Array.isArray(payload.sections)) {
    for (const section of payload.sections) {
      if (!section || typeof section !== "object") continue;
      const rows = (section as { rows?: unknown }).rows;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const title = readTrimmedString((row as { title?: unknown }).title);
        if (title) labels.push(title);
      }
    }
  }

  return labels;
}

function appendInstagramChoiceLabels(text: string, labels: string[]): string {
  const unique = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (unique.length === 0) return text;
  if (unique.every((label) => text.includes(label))) return text;
  const body = text.trim();
  const list = unique.map((label) => `• ${label}`).join("\n");
  return body ? `${body}\n\n${list}` : list;
}

function markUnsupportedInstagramEnvelope(envelope: WebhookEnvelopeDto): WebhookEnvelopeDto {
  if (envelope.eventType !== "message.received") return envelope;
  if (envelope.payload.postback) return envelope;

  const message = envelope.payload.message as InstagramWebhookMessage | undefined;
  if (!message || instagramMessageHasInboundContent(message)) return envelope;

  return { ...envelope, eventType: "message.unsupported" };
}

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
    return mapMetaMessagingEventsToEnvelopes(
      ctx,
      this.channelKey,
      events,
      "instagramBusinessAccountId",
    ).map(markUnsupportedInstagramEnvelope);
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
          typeof payload.senderExternalId === "string" ? payload.senderExternalId : null,
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
      instagramMessageType: resolveInstagramMessageType(message, attachments),
      senderExternalId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : undefined,
      instagramBusinessAccountId:
        typeof payload.instagramBusinessAccountId === "string"
          ? payload.instagramBusinessAccountId
          : undefined,
    };

    const quickReplyPayload = readTrimmedString(message.quick_reply?.payload);
    const quickReplyTitle = readTrimmedString(message.quick_reply?.title);
    if (quickReplyPayload || quickReplyTitle) {
      metadata.kind = "interactive_reply";
      metadata.interactionType = "quick_reply";
      metadata.replyId = quickReplyPayload || quickReplyTitle;
      metadata.title = quickReplyTitle || text;
    }

    return {
      externalThreadId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : "",
      externalMessageId: message.mid ?? `${payload.senderExternalId ?? "unknown"}:message`,
      senderExternalId:
        typeof payload.senderExternalId === "string" ? payload.senderExternalId : null,
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
      message: {
        text: appendInstagramChoiceLabels(
          message.text,
          readInstagramChoiceLabels(readStructuredOutboundPayload(message)),
        ),
      },
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
    const attachments: ChannelAttachmentDto[] = [];

    for (const attachment of message.attachments ?? []) {
      const type = attachment.type?.toLowerCase();
      const url = readTrimmedString(attachment.payload?.url);
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

    const text =
      readTrimmedString(message.text) ||
      extractInstagramGenericElementText(message) ||
      extractInstagramQuickReplyText(message);

    return { text, attachments };
  }
}

export function createInstagramCloudAdapter(options?: InstagramCloudAdapterOptions): InstagramCloudAdapter {
  return new InstagramCloudAdapter(options);
}
