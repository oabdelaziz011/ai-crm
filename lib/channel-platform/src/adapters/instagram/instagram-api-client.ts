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
import { INSTAGRAM_LOGIN_GRAPH_HOST, instagramMessagesUrl } from "./instagram-config.js";
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

const FACEBOOK_GRAPH_HOST = "https://graph.facebook.com";

function withAccessTokenQuery(endpoint: string, accessToken: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

function normalizeInstagramAccessToken(token: string): string {
  return token.replace(/\s+/g, "").trim();
}

export function rewriteInstagramMessagesHost(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.origin !== FACEBOOK_GRAPH_HOST) return endpoint;
  url.protocol = "https:";
  url.host = INSTAGRAM_LOGIN_GRAPH_HOST.replace(/^https:\/\//, "");
  return url.toString();
}

function isUnparseableAccessToken(body: InstagramSendMessageResponse): boolean {
  const code = body.error?.code;
  const message = body.error?.error_user_msg ?? body.error?.message ?? "";
  return code === 190 || /cannot parse access token/i.test(message);
}

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
    const accessToken = normalizeInstagramAccessToken(config.accessToken);
    if (!accessToken) {
      throw new ValidationError("Instagram access token is empty.");
    }

    const diagnosticEndpoint = instagramMessagesUrl(config);
    let lastBody: InstagramSendMessageResponse | undefined;
    let lastStatus = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const hostEndpoint = attempt === 0 ? diagnosticEndpoint : rewriteInstagramMessagesHost(diagnosticEndpoint);
      const requestUrl = withAccessTokenQuery(hostEndpoint, accessToken);
      // First try Bearer + query. On Meta 190, retry query-only: a stripped/corrupt
      // Authorization header makes Graph ignore a valid access_token query param.
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (attempt === 0) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await this.fetchFn(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as InstagramSendMessageResponse;
      lastBody = body;
      lastStatus = response.status;

      this.options.onOutboundRequest?.({
        endpoint: diagnosticEndpoint,
        graphApiVersion: config.apiVersion ?? "v21.0",
        instagramBusinessAccountId: config.instagramBusinessAccountId,
        pageId: config.pageId,
        accessTokenSource: options?.accessTokenSource ?? "company_instagram_settings",
        messageType: payload.message.attachment?.type ?? (payload.message.text ? "text" : "unknown"),
        httpStatus: response.status,
        metaErrorCode: body.error?.code,
        metaErrorMessage: body.error?.error_user_msg ?? body.error?.message,
      });

      if (response.ok) {
        return body;
      }

      if (!isUnparseableAccessToken(body)) {
        break;
      }
    }

    throw new ValidationError(
      lastBody?.error?.error_user_msg ??
        lastBody?.error?.message ??
        `Instagram API error (${lastStatus})`,
      { metaErrorCode: lastBody?.error?.code },
    );
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
