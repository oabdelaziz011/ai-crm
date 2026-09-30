/** Public Web Presence widget channels share the web_chat key but never serve internal AI chat. */
export const WEB_WIDGET_CHANNEL_PROVIDER = "valueor.web_widget";

type WebChatChannelCandidate = {
  provider: string;
  is_default: boolean;
};

export function selectInternalWebChatChannel<T extends WebChatChannelCandidate>(
  channels: readonly T[],
): T | null {
  const internal = channels.filter((channel) => channel.provider !== WEB_WIDGET_CHANNEL_PROVIDER);
  return internal.find((channel) => channel.is_default) ?? internal[0] ?? null;
}
