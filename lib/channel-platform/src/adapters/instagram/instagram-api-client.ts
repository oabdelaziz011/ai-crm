import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../meta/meta-graph-webhook.js";
import {
  extractMetaMessagingAccountId,
  parseMetaMessagingWebhookEvents,
  summarizeMetaMessagingWebhookPayload,
} from "../meta/meta-messaging-webhook.js";
import type { InstagramChannelConfiguration } from "./instagram-config.js";
import { instagramMessagesUrl } from "./instagram-config.js";
import type {
  InstagramSendMessagePayload,
  InstagramSendMessageResponse,
} from "./instagram-types.js";
import { ValidationError } from "../../errors.js";

export type InstagramApiClientOptions = {
  fetchFn?: typeof fetch;
  onOutboundRequest?: (detail: InstagramOutboundRequestDiagnostic) => void;
};

export type InstagramOutboundRequestDiagnostic = {
  endpoint: string;
  graphApiVersion: string;
  instagramBusinessAccountId: string;
  pageId?: string;
  accessTokenSource: string;
  messageType?: string;
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorMessage?: string;
};

export class InstagramApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: InstagramApiClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async sendMessage(
    config: InstagramChannelConfiguration,
    payload: InstagramSendMessagePayload,
    options?: { accessTokenSource?: string },
  ): Promise<InstagramSendMessageResponse> {
    const endpoint = instagramMessagesUrl(config);
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as InstagramSendMessageResponse;

    this.options.onOutboundRequest?.({
      endpoint,
      graphApiVersion: config.apiVersion ?? "v21.0",
      instagramBusinessAccountId: config.instagramBusinessAccountId,
      pageId: config.pageId,
      accessTokenSource: options?.accessTokenSource ?? "company_instagram_settings",
      messageType: payload.message.attachment?.type ?? (payload.message.text ? "text" : "unknown"),
      httpStatus: response.status,
      metaErrorCode: body.error?.code,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
    });

    if (!response.ok) {
      throw new ValidationError(
        body.error?.error_user_msg ?? body.error?.message ?? `Instagram API error (${response.status})`,
      );
    }

    return body;
  }
}

export const verifyInstagramWebhookChallenge = verifyMetaWebhookChallenge;
export const verifyInstagramWebhookSignature = verifyMetaWebhookSignature;

export function extractInstagramBusinessAccountId(rawPayload: Record<string, unknown>): string | null {
  return extractMetaMessagingAccountId(rawPayload, "instagram");
}

export function parseInstagramWebhookEvents(rawPayload: Record<string, unknown>) {
  return parseMetaMessagingWebhookEvents(rawPayload, "instagram").map((event) => ({
    ...event,
    instagramBusinessAccountId: event.kind !== "status" ? event.accountId : undefined,
  }));
}

export function summarizeInstagramWebhookPayload(rawPayload: Record<string, unknown>) {
  const summary = summarizeMetaMessagingWebhookPayload(rawPayload, "instagram");
  return {
    object: summary.object,
    entryCount: summary.entryCount,
    instagramBusinessAccountId: summary.accountId,
    messagingCount: summary.messagingCount,
  };
}
