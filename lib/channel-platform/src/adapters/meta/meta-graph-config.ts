export function metaGraphBaseUrl(apiVersion: string): string {
  const version = apiVersion.trim() || "v21.0";
  return `https://graph.facebook.com/${version}`;
}

export function metaMessagesUrl(apiVersion: string, accountId: string): string {
  return `${metaGraphBaseUrl(apiVersion)}/${encodeURIComponent(accountId)}/messages`;
}
