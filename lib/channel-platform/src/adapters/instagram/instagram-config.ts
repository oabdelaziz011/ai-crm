export type InstagramChannelReferences = {
  instagramBusinessAccountId?: string;
  pageId?: string;
  credentialsSource?: string;
};

export type InstagramChannelConfiguration = {
  instagramBusinessAccountId: string;
  pageId?: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion: string;
};

/** Instagram API with Instagram Login — Instagram User tokens are invalid on Facebook Graph. */
export const INSTAGRAM_LOGIN_GRAPH_HOST = "https://graph.instagram.com";

export function instagramGraphBaseUrl(apiVersion: string): string {
  const version = apiVersion.trim() || "v21.0";
  return `${INSTAGRAM_LOGIN_GRAPH_HOST}/${version}`;
}

export function instagramMessagesUrl(config: InstagramChannelConfiguration): string {
  return `${instagramGraphBaseUrl(config.apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}/messages`;
}

export function parseInstagramChannelReferences(
  configuration: Record<string, unknown>,
): InstagramChannelReferences {
  return {
    instagramBusinessAccountId:
      typeof configuration.instagramBusinessAccountId === "string"
        ? configuration.instagramBusinessAccountId.trim()
        : undefined,
    pageId: typeof configuration.pageId === "string" ? configuration.pageId.trim() : undefined,
    credentialsSource:
      typeof configuration.credentialsSource === "string"
        ? configuration.credentialsSource.trim()
        : undefined,
  };
}
