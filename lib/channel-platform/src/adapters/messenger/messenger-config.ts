import { metaGraphBaseUrl, metaMessagesUrl } from "../meta/meta-graph-config.js";

export type MessengerChannelReferences = {
  pageId?: string;
  credentialsSource?: string;
};

export type MessengerChannelConfiguration = {
  pageId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion: string;
  enabled?: boolean;
};

export function messengerGraphBaseUrl(apiVersion: string): string {
  return metaGraphBaseUrl(apiVersion);
}

export function messengerMessagesUrl(config: MessengerChannelConfiguration): string {
  return metaMessagesUrl(config.apiVersion, config.pageId);
}

export function parseMessengerChannelReferences(
  configuration: Record<string, unknown>,
): MessengerChannelReferences {
  return {
    pageId: typeof configuration.pageId === "string" ? configuration.pageId.trim() : undefined,
    credentialsSource:
      typeof configuration.credentialsSource === "string"
        ? configuration.credentialsSource.trim()
        : undefined,
  };
}
