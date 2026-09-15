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
import {
  instagramMeUrl,
  instagramMessagesUrl,
  readInstagramLoginUserId,
} from "./instagram-config.js";
import { normalizeInstagramWebhookPayload } from "./instagram-webhook-payload.js";
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
    let attempt = await this.sendMessageAttempt(config, payload, options);
    if (!attempt.response.ok) {
      const tokenOwnerId = await this.resolveTokenOwnerId(config);
      if (tokenOwnerId && tokenOwnerId !== config.instagramBusinessAccountId) {
        attempt = await this.sendMessageAttempt(
          { ...config, instagramBusinessAccountId: tokenOwnerId },
          payload,
          options,
        );
      }
    }

    if (!attempt.response.ok) {
      throw new ValidationError(
        attempt.body.error?.error_user_msg ??
          attempt.body.error?.message ??
          `Instagram API error (${attempt.response.status})`,
      );
    }

    return attempt.body;
  }

  private async sendMessageAttempt(
    config: InstagramChannelConfiguration,
    payload: InstagramSendMessagePayload,
    options?: { accessTokenSource?: string },
  ): Promise<{ response: Response; body: InstagramSendMessageResponse }> {
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
      messageType: payload.message.quick_replies
        ? "quick_replies"
        : payload.message.attachment?.type ?? (payload.message.text ? "text" : "unknown"),
      httpStatus: response.status,
      metaErrorCode: body.error?.code,
      metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
    });

    return { response, body };
  }

  private async resolveTokenOwnerId(
    config: InstagramChannelConfiguration,
  ): Promise<string | null> {
    try {
      const response = await this.fetchFn(instagramMeUrl(config.apiVersion), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { user_id?: string; id?: string };
      return readInstagramLoginUserId(body) ?? null;
    } catch {
      return null;
    }
  }
}

export const verifyInstagramWebhookChallenge = verifyMetaWebhookChallenge;
export const verifyInstagramWebhookSignature = verifyMetaWebhookSignature;

export function extractInstagramBusinessAccountId(rawPayload: Record<string, unknown>): string | null {
  return extractMetaMessagingAccountId(normalizeInstagramWebhookPayload(rawPayload), "instagram");
}

export function parseInstagramWebhookEvents(rawPayload: Record<string, unknown>) {
  return parseMetaMessagingWebhookEvents(normalizeInstagramWebhookPayload(rawPayload), "instagram").map(
    (event) => ({
      ...event,
      instagramBusinessAccountId: event.kind !== "status" ? event.accountId : undefined,
    }),
  );
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

export { describeInstagramWebhookShape, normalizeInstagramWebhookPayload } from "./instagram-webhook-payload.js";
