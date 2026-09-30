/** Must match the widget channel provider stamped by web_chat_public_ensure_conversation. */
export const PUBLIC_WEB_CHAT_CHANNEL_PROVIDER = "valueor.web_widget";

const PUBLIC_WEB_CHAT_ROW_PREDICATE =
  `and(channel_type.eq.web_chat,metadata->>publicWebChat.eq.true,metadata->>channelProvider.eq.${PUBLIC_WEB_CHAT_CHANNEL_PROVIDER})`;

/**
 * PostgREST `or` expression: allowlisted channel types OR public widget rows.
 * `web_chat` is dropped from the IN list so internal AI chat can never ride along.
 */
export function buildPublicWebChatChannelScopeOr(channelTypes: readonly string[]): string {
  const others = channelTypes.filter((channel) => channel !== "web_chat");
  if (others.length === 0) return PUBLIC_WEB_CHAT_ROW_PREDICATE;
  return `channel_type.in.(${others.join(",")}),${PUBLIC_WEB_CHAT_ROW_PREDICATE}`;
}
