import type { OmnichannelChannelKey } from "@/lib/omnichannel/types/unified-conversation";
import type { OutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";
import { isConfirmedDeliveryPhase, shouldDisplayOutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";

const DELIVERY_STATUS_CHANNELS = new Set<OmnichannelChannelKey>([
  "whatsapp",
  "messenger",
  "instagram",
  "sms",
  "telegram",
]);

const REACTION_CHANNELS = new Set<OmnichannelChannelKey>([
  "whatsapp",
  "messenger",
  "instagram",
  "telegram",
]);

const ATTACHMENT_CHANNELS = new Set<OmnichannelChannelKey>([
  "whatsapp",
  "messenger",
  "instagram",
  "email",
  "telegram",
]);

export function channelSupportsDeliveryStatus(channel: OmnichannelChannelKey): boolean {
  return DELIVERY_STATUS_CHANNELS.has(channel);
}

export function channelSupportsReactions(channel: OmnichannelChannelKey): boolean {
  return REACTION_CHANNELS.has(channel);
}

export function channelSupportsAttachments(channel: OmnichannelChannelKey): boolean {
  return ATTACHMENT_CHANNELS.has(channel);
}

export function shouldShowDeliveryStatus(
  channel: OmnichannelChannelKey,
  phase: OutboundDeliveryPhase,
): boolean {
  if (!channelSupportsDeliveryStatus(channel)) return false;
  if (!shouldDisplayOutboundDeliveryPhase(phase)) return false;
  if (phase === "failed" || phase === "pending_retry") return true;
  if (isConfirmedDeliveryPhase(phase)) return true;
  return phase === "preparing" || phase === "dispatching";
}
