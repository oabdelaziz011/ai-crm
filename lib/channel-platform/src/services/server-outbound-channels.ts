/** Channels whose outbound delivery requires server-side credential access. */
export const SERVER_OUTBOUND_CHANNEL_KEYS = [
  "whatsapp",
  "instagram",
  "messenger",
  "email",
] as const;

export type ServerOutboundChannelKey = (typeof SERVER_OUTBOUND_CHANNEL_KEYS)[number];

export function requiresServerOutboundDispatch(channelKey: string): boolean {
  return (SERVER_OUTBOUND_CHANNEL_KEYS as readonly string[]).includes(channelKey);
}
