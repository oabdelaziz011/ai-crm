import { hasCampaignOutboundEmail } from "@/lib/campaigns/email-capability";
import { hasWhatsAppOutboundPhoneCandidate } from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";

/** Presence columns shown in the manual audience picker. */
export const CAMPAIGN_PICKER_CHANNEL_COLUMNS = [
  "messenger",
  "whatsapp",
  "instagram",
  "email",
  "sms",
] as const;

export type CampaignPickerChannelColumn = (typeof CAMPAIGN_PICKER_CHANNEL_COLUMNS)[number];

export type CampaignPickerCustomerIdentity = {
  phone?: string | null;
  phone_e164?: string | null;
  phoneE164?: string | null;
  email?: string | null;
};

export type CampaignMessagingPresence = ReadonlyMap<string, ReadonlySet<"instagram" | "messenger">>;

export function customerHasPickerChannel(input: {
  customer: CampaignPickerCustomerIdentity;
  customerId: string;
  channel: CampaignPickerChannelColumn;
  messagingPresence: CampaignMessagingPresence;
}): boolean {
  switch (input.channel) {
    case "whatsapp":
    case "sms":
      return hasWhatsAppOutboundPhoneCandidate(input.customer);
    case "email":
      return hasCampaignOutboundEmail(input.customer);
    case "instagram":
      return input.messagingPresence.get(input.customerId)?.has("instagram") === true;
    case "messenger":
      return input.messagingPresence.get(input.customerId)?.has("messenger") === true;
    default:
      return false;
  }
}

export function buildMessagingPresence(
  rows: readonly { customer_id: string | null; channel_type: string }[],
): Map<string, Set<"instagram" | "messenger">> {
  const map = new Map<string, Set<"instagram" | "messenger">>();
  for (const row of rows) {
    const customerId = row.customer_id?.trim();
    if (!customerId) continue;
    const channel = row.channel_type === "instagram" || row.channel_type === "messenger"
      ? row.channel_type
      : null;
    if (!channel) continue;
    const set = map.get(customerId) ?? new Set<"instagram" | "messenger">();
    set.add(channel);
    map.set(customerId, set);
  }
  return map;
}
