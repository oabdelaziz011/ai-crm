/** Marketing campaigns — domain types (V1: WhatsApp + Instagram + Messenger). */

export const MARKETING_CAMPAIGN_CHANNELS = ["whatsapp", "instagram", "messenger"] as const;
export type MarketingCampaignChannel = (typeof MARKETING_CAMPAIGN_CHANNELS)[number];

export function isMarketingCampaignChannel(value: string): value is MarketingCampaignChannel {
  return (MARKETING_CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

export function normalizeCampaignChannels(
  channels: readonly string[] | null | undefined,
): MarketingCampaignChannel[] {
  const unique: MarketingCampaignChannel[] = [];
  for (const raw of channels ?? []) {
    const key = String(raw).trim().toLowerCase();
    if (!isMarketingCampaignChannel(key)) continue;
    if (!unique.includes(key)) unique.push(key);
  }
  return unique;
}

export const MARKETING_CAMPAIGN_STATUSES = [
  "draft",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type MarketingCampaignStatus = (typeof MARKETING_CAMPAIGN_STATUSES)[number];

export const MARKETING_CAMPAIGN_AUDIENCE_TYPES = ["all", "filtered", "manual"] as const;
export type MarketingCampaignAudienceType = (typeof MARKETING_CAMPAIGN_AUDIENCE_TYPES)[number];

export const MARKETING_CAMPAIGN_RECIPIENT_STATUSES = [
  "pending",
  "queued",
  "sent",
  "failed",
  "skipped",
] as const;
export type MarketingCampaignRecipientStatus =
  (typeof MARKETING_CAMPAIGN_RECIPIENT_STATUSES)[number];

/**
 * Server-safe audience filters only (DB-backed customer columns).
 * Derived list fields (status/vip/tags/outstanding/etc.) are intentionally excluded.
 */
export type CampaignAudienceFilterDefinition = {
  search?: string | null;
  gender?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  registeredFrom?: string | null;
  registeredTo?: string | null;
};

export type CampaignAudienceDefinition =
  | { type: "all" }
  | { type: "filtered"; filters: CampaignAudienceFilterDefinition }
  | { type: "manual"; customerIds: string[] };

export type CampaignContentDefinition = {
  campaignTitle: string;
  detail: string;
};

export type MarketingCampaignRecord = {
  id: string;
  company_id: string;
  name: string;
  status: MarketingCampaignStatus;
  audience_type: MarketingCampaignAudienceType;
  audience_definition: Record<string, unknown>;
  channels: MarketingCampaignChannel[];
  content_definition: Record<string, unknown>;
  created_by: string | null;
  idempotency_key: string;
  total_recipients_count: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type MarketingCampaignRecipientRecord = {
  id: string;
  campaign_id: string;
  company_id: string;
  customer_id: string;
  channel: MarketingCampaignChannel;
  status: MarketingCampaignRecipientStatus;
  notification_queue_id: string | null;
  channel_delivery_event_id: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  /** Migration 335 — nullable until delivery reconcile writes them. */
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
  replied_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignAudienceCustomer = {
  id: string;
  companyId: string;
  name: string;
  phone: string | null;
  /** Additive identity (migration 332). Preferred for WhatsApp outbound when set. */
  phoneE164: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  createdAt: string;
};

export type CampaignAudienceResolveResult = {
  customers: CampaignAudienceCustomer[];
  recipientCount: number;
  excludedOptedOutCount: number;
  excludedOtherCompanyCount: number;
  excludedMissingCount: number;
};

export type CreateCampaignDraftInput = {
  name: string;
  audience: CampaignAudienceDefinition;
  content: CampaignContentDefinition;
  idempotencyKey: string;
  /** Allowed: whatsapp | instagram | messenger. SMS rejected. */
  channels?: MarketingCampaignChannel[];
};

export type CampaignChannelCounts = {
  channel: MarketingCampaignChannel;
  total: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

export type CampaignChannelEligibilityPreview = {
  channel: MarketingCampaignChannel;
  companyAvailable: boolean;
  unavailableReason: string | null;
  eligible: number;
  skipped: number;
};

export type CampaignEligibilityPreviewResult = {
  audienceCount: number;
  marketingEligibleCount: number;
  excludedOptedOutCount: number;
  excludedOtherCompanyCount: number;
  excludedMissingCount: number;
  byChannel: CampaignChannelEligibilityPreview[];
};

export type CampaignExecuteResult = {
  campaignId: string;
  status: MarketingCampaignStatus;
  totalRecipientsCount: number;
  queuedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  channelCounts: CampaignChannelCounts[];
  reusedExisting: boolean;
  queueSucceeded: boolean;
};

export class MarketingCampaignError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unauthorized"
      | "invalid_input"
      | "whatsapp_unavailable"
      | "channel_unavailable"
      | "campaign_not_found"
      | "campaign_not_runnable"
      | "duplicate_in_progress",
  ) {
    super(message);
    this.name = "MarketingCampaignError";
  }
}

/** Meta RESPONSE messaging window used by Messenger adapter (and applied to IG for safety). */
export const META_MESSAGING_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
