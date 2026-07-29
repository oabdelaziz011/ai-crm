import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  mapMetaDeliveryStatus,
} from "../meta/meta-graph-webhook.js";
import type {
  ParsedWhatsAppWebhookEvent,
  WhatsAppSendMessagePayload,
  WhatsAppSendMessageResponse,
  WhatsAppWebhookPayload,
} from "./whatsapp-types.js";
import type { WhatsAppChannelConfiguration } from "./whatsapp-config.js";
import { whatsAppMessagesUrl } from "./whatsapp-config.js";
import { ValidationError } from "../../errors.js";

export type WhatsAppApiClientOptions = {
  fetchFn?: typeof fetch;
  onOutboundRequest?: (detail: WhatsAppOutboundRequestDiagnostic) => void;
};

export type WhatsAppOutboundRequestDiagnostic = {
  endpoint: string;
  graphApiVersion: string;
  phoneNumberId: string;
  businessAccountId?: string;
  accessTokenSource: string;
  recipientType?: string;
  messageType?: string;
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorMessage?: string;
};

export class WhatsAppApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: WhatsAppApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendMessage(
    config: WhatsAppChannelConfiguration,
    payload: WhatsAppSendMessagePayload,
    options?: { accessTokenSource?: string },
  ): Promise<WhatsAppSendMessageResponse> {
    const endpoint = whatsAppMessagesUrl(config);
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as WhatsAppSendMessageResponse & {
      error?: { message?: string; error_user_msg?: string; code?: number };
    };

    this.options.onOutboundRequest?.({
      endpoint,
      graphApiVersion: config.apiVersion ?? "v21.0",
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      accessTokenSource: options?.accessTokenSource ?? "company_channels.configuration",
      recipientType: payload.recipient_type,
      messageType: payload.type,
      httpStatus: response.status,
      metaErrorCode: body.error?.code,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
    });

    if (!response.ok) {
      throw new ValidationError(
        body.error?.error_user_msg ?? body.error?.message ?? `WhatsApp API error (${response.status})`,
      );
    }

    return body;
  }

  async getMediaUrl(config: WhatsAppChannelConfiguration, mediaId: string): Promise<string> {
    const apiVersion = config.apiVersion ?? "v21.0";
    const metaResponse = await this.fetchFn(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const meta = (await metaResponse.json()) as { url?: string; error?: { message?: string } };
    if (!metaResponse.ok || !meta.url) {
      throw new ValidationError(meta.error?.message ?? "Failed to resolve WhatsApp media URL.");
    }
    return meta.url;
  }
}

export function verifyWhatsAppWebhookChallenge(input: {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
  expectedVerifyToken: string;
}): string | null {
  return verifyMetaWebhookChallenge(input);
}

export async function verifyWhatsAppWebhookSignature(input: {
  signatureHeader?: string | null;
  rawBody: string;
  appSecret?: string | null;
  requireSecret?: boolean;
}): Promise<boolean> {
  return verifyMetaWebhookSignature(input);
}

export function parseWhatsAppWebhookEvents(rawPayload: Record<string, unknown>): ParsedWhatsAppWebhookEvent[] {
  const payload = rawPayload as WhatsAppWebhookPayload;
  if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: ParsedWhatsAppWebhookEvent[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;

      for (const message of value.messages ?? []) {
        events.push({
          kind: "message",
          idempotencyKey: message.id,
          externalThreadId: message.from,
          externalMessageId: message.id,
          senderExternalId: message.from,
          senderName: value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name,
          phoneNumberId,
          message,
          raw: rawPayload,
        });
      }

      for (const status of value.statuses ?? []) {
        events.push({
          kind: "status",
          idempotencyKey: `${status.id}:${status.status}:${status.timestamp}`,
          externalMessageId: status.id,
          externalThreadId: status.recipient_id,
          status: status.status,
          providerResponse: { status },
          errorMessage: status.errors?.[0]?.message ?? status.errors?.[0]?.title,
          raw: rawPayload,
        });
      }
    }
  }

  return events;
}

export function mapWhatsAppDeliveryStatus(
  status: "sent" | "delivered" | "read" | "failed",
): "sent" | "delivered" | "read" | "failed" {
  return mapMetaDeliveryStatus(status);
}
