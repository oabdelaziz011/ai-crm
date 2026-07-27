import type { CommunicationChannelKey } from "@workspace/channel-registry";

const DEFAULT_PROVIDERS: Partial<Record<CommunicationChannelKey, string>> = {
  web_chat: "generic.web_chat",
  whatsapp: "meta",
  messenger: "meta",
  instagram: "meta",
  telegram: "telegram",
  email: "generic.email",
};

const FIXED_PROVIDER_CHANNEL_KEYS = new Set<CommunicationChannelKey>(["web_chat"]);

export function resolveDefaultChannelProvider(channelKey: string | undefined): string {
  if (!channelKey) return "";
  return DEFAULT_PROVIDERS[channelKey as CommunicationChannelKey] ?? "";
}

export function isFixedProviderChannel(channelKey: string | undefined): boolean {
  if (!channelKey) return false;
  return FIXED_PROVIDER_CHANNEL_KEYS.has(channelKey as CommunicationChannelKey);
}

export function resolveDefaultHealthStatus(channelKey: string | undefined): "connected" | "unknown" {
  return channelKey === "web_chat" ? "connected" : "unknown";
}
