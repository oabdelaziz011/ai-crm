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

/** Instagram API with Instagram Login — not Facebook Graph / Page tokens. */
export const INSTAGRAM_LOGIN_GRAPH_HOST = "https://graph.instagram.com";

/** Professional account ID (`user_id` / `<IG_ID>`) plus display fields. */
export const INSTAGRAM_LOGIN_ME_FIELDS = "user_id,username,name";

export const INSTAGRAM_LOGIN_USER_FIELDS = "id,user_id,username,name";

export function instagramGraphBaseUrl(apiVersion: string): string {
  const version = apiVersion.trim() || "v21.0";
  return `${INSTAGRAM_LOGIN_GRAPH_HOST}/${version}`;
}

export function instagramMeUrl(apiVersion: string): string {
  return `${instagramGraphBaseUrl(apiVersion)}/me?fields=${INSTAGRAM_LOGIN_ME_FIELDS}`;
}

export function instagramUserLookupUrl(config: InstagramChannelConfiguration): string {
  return `${instagramGraphBaseUrl(config.apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}?fields=${INSTAGRAM_LOGIN_USER_FIELDS}`;
}

export function instagramMessagesUrl(config: InstagramChannelConfiguration): string {
  return `${instagramGraphBaseUrl(config.apiVersion)}/${encodeURIComponent(config.instagramBusinessAccountId)}/messages`;
}

/** Prefer Instagram professional `user_id` (`<IG_ID>`) over app-scoped `id`. */
export function readInstagramLoginUserId(body: { user_id?: string; id?: string }): string | undefined {
  const professionalId = body.user_id?.trim();
  if (professionalId) return professionalId;
  const scopedId = body.id?.trim();
  return scopedId || undefined;
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
