import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../meta/meta-graph-webhook.js";
import {
  extractMetaMessagingAccountId,
  parseMetaMessagingWebhookEvents,
  summarizeMetaMessagingWebhookPayload,
} from "../meta/meta-messaging-webhook.js";
import type { MessengerChannelConfiguration } from "./messenger-config.js";
import { messengerMessagesUrl } from "./messenger-config.js";
import type { MessengerSendMessagePayload, MessengerSendMessageResponse } from "./messenger-types.js";
import { ValidationError } from "../../errors.js";

export type MessengerApiClientOptions = {
  fetchFn?: typeof fetch;
  onOutboundRequest?: (detail: MessengerOutboundRequestDiagnostic) => void;
};

export type MessengerOutboundRequestDiagnostic = {
  endpoint: string;
  graphApiVersion: string;
  pageId: string;
  accessTokenSource: string;
  messageType?: string;
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorMessage?: string;
};

export class MessengerApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: MessengerApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendMessage(
    config: MessengerChannelConfiguration,
    payload: MessengerSendMessagePayload,
    options?: { accessTokenSource?: string },
  ): Promise<MessengerSendMessageResponse> {
    const endpoint = messengerMessagesUrl(config);
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_type: payload.messaging_type ?? "RESPONSE",
        ...payload,
      }),
    });

    const body = (await response.json()) as MessengerSendMessageResponse;

    this.options.onOutboundRequest?.({
      endpoint,
      graphApiVersion: config.apiVersion ?? "v21.0",
      pageId: config.pageId,
      accessTokenSource: options?.accessTokenSource ?? "company_messenger_settings",
      messageType: payload.message.attachment?.type ?? (payload.message.text ? "text" : "unknown"),
      httpStatus: response.status,
      metaErrorCode: body.error?.code,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
    });

    if (!response.ok) {
      throw new ValidationError(
        body.error?.error_user_msg ?? body.error?.message ?? `Messenger API error (${response.status})`,
      );
    }

    return body;
  }
}

export const verifyMessengerWebhookChallenge = verifyMetaWebhookChallenge;
export const verifyMessengerWebhookSignature = verifyMetaWebhookSignature;

export function extractMessengerPageId(rawPayload: Record<string, unknown>): string | null {
  return extractMetaMessagingAccountId(rawPayload, "page");
}

export function parseMessengerWebhookEvents(rawPayload: Record<string, unknown>) {
  return parseMetaMessagingWebhookEvents(rawPayload, "page");
}

export function summarizeMessengerWebhookPayload(rawPayload: Record<string, unknown>) {
  const summary = summarizeMetaMessagingWebhookPayload(rawPayload, "page");
  return {
    object: summary.object,
    entryCount: summary.entryCount,
    pageId: summary.accountId,
    messagingCount: summary.messagingCount,
  };
}
