import type {
  MarketingCampaignChannel,
  MarketingCampaignRecipientStatus,
  MarketingCampaignStatus,
} from "@/lib/campaigns";

export const CAMPAIGN_UI_CHANNELS: MarketingCampaignChannel[] = [
  "whatsapp",
  "instagram",
  "messenger",
];

/** Never include SMS in Campaign UI surfaces. */
export function isCampaignUiChannel(value: string): value is MarketingCampaignChannel {
  return (CAMPAIGN_UI_CHANNELS as readonly string[]).includes(value);
}

export function campaignStatusLabelKey(status: MarketingCampaignStatus): string {
  switch (status) {
    case "draft":
      return "campaigns.status.draft";
    case "running":
      return "campaigns.status.running";
    case "completed":
      return "campaigns.status.completed";
    case "failed":
      return "campaigns.status.failed";
    case "cancelled":
      return "campaigns.status.cancelled";
    default:
      return "campaigns.status.unknown";
  }
}

export function recipientStatusLabelKey(status: MarketingCampaignRecipientStatus): string {
  switch (status) {
    case "pending":
      return "campaigns.recipientStatus.pending";
    case "queued":
      return "campaigns.recipientStatus.queued";
    case "sent":
      return "campaigns.recipientStatus.sent";
    case "failed":
      return "campaigns.recipientStatus.failed";
    case "skipped":
      return "campaigns.recipientStatus.skipped";
    default:
      return "campaigns.recipientStatus.unknown";
  }
}

export function channelLabelKey(channel: MarketingCampaignChannel): string {
  switch (channel) {
    case "whatsapp":
      return "campaigns.channels.whatsapp";
    case "instagram":
      return "campaigns.channels.instagram";
    case "messenger":
      return "campaigns.channels.messenger";
    default:
      return "campaigns.channels.unknown";
  }
}

/** Map durable skip/error codes to safe i18n keys (never expose secrets). */
export function skipReasonLabelKey(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const code = reason.trim().toLowerCase();
  if (code.includes("no eligible whatsapp") || code.includes("no phone")) {
    return "campaigns.skipReasons.noPhone";
  }
  if (code.includes("receive_marketing") || code.includes("opt")) {
    return "campaigns.skipReasons.marketingOptOut";
  }
  if (code.includes("no_instagram_conversation") || code.includes("no_active_instagram")) {
    return "campaigns.skipReasons.noInstagramConversation";
  }
  if (code.includes("no_messenger_conversation") || code.includes("no_active_messenger")) {
    return "campaigns.skipReasons.noMessengerConversation";
  }
  if (code.includes("missing_igsid")) return "campaigns.skipReasons.missingIgsid";
  if (code.includes("missing_psid")) return "campaigns.skipReasons.missingPsid";
  if (code.includes("messaging_window")) return "campaigns.skipReasons.messagingWindow";
  if (code.includes("unavailable") || code.includes("not_entitled") || code.includes("credentials")) {
    return "campaigns.skipReasons.channelUnavailable";
  }
  if (code.includes("skipped by preferences")) return "campaigns.skipReasons.preferences";
  return "campaigns.skipReasons.generic";
}

export function overallCampaignResultKind(input: {
  status: MarketingCampaignStatus;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}): "draft" | "running" | "failed" | "completed" | "partial" | "cancelled" {
  if (input.status === "draft") return "draft";
  if (input.status === "running") return "running";
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "failed") return "failed";
  if (input.failed > 0 && (input.queued > 0 || input.sent > 0 || input.skipped > 0)) {
    return "partial";
  }
  if (input.failed > 0 && input.queued === 0 && input.sent === 0 && input.skipped === 0) {
    return "failed";
  }
  return "completed";
}
