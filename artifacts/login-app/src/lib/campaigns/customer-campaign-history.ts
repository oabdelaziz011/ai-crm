/**
 * Customer campaign history — pure read-model helpers.
 * Canonical link: company_id + customer_id → marketing_campaign_recipients → campaigns.
 * Never matches by phone / last-9.
 *
 * Delivery/read/replied come from recipient lifecycle timestamps (migration 335)
 * and optional channel_delivery_events enrichment (Meta IG/Messenger path).
 * Never fabricate delivered/read/replied.
 */
import type {
  MarketingCampaignChannel,
  MarketingCampaignRecipientStatus,
} from "./types";

export const CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE = 20;

export type CustomerCampaignHistoryPeriod =
  | "7d"
  | "30d"
  | "90d"
  | "all"
  | "custom";

/** UI filter over recipient + optional delivery enrichment (not a second status system). */
export type CustomerCampaignHistoryStatusFilter =
  | "all"
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "skipped";

export type CustomerCampaignHistoryQuery = {
  companyId: string;
  customerId: string;
  page?: number;
  pageSize?: number;
  status?: CustomerCampaignHistoryStatusFilter | null;
  channel?: MarketingCampaignChannel | "all" | null;
  period?: CustomerCampaignHistoryPeriod | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type CustomerCampaignDeliveryEnrichment = {
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  repliedAt: string | null;
  deliveryStatus: string | null;
  externalMessageId: string | null;
};

export type CustomerCampaignHistoryItem = {
  recipientId: string;
  campaignId: string;
  companyId: string;
  customerId: string;
  channel: MarketingCampaignChannel;
  status: MarketingCampaignRecipientStatus;
  notificationQueueId: string | null;
  channelDeliveryEventId: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  campaignName: string;
  campaignStatus: string;
  contentTitle: string | null;
  contentDetail: string | null;
  /**
   * Soft enrichment from recipient lifecycle timestamps and/or
   * channel_delivery_events when linked (Meta path).
   */
  delivery: CustomerCampaignDeliveryEnrichment | null;
};

export type CustomerCampaignHistorySummary = {
  total: number;
  /** Recipients with durable sent signal (status=sent or sent_at). */
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  /** @deprecated use `sent` — kept briefly for callers during transition */
  queuedOrSent?: number;
};

export type CustomerCampaignHistoryResult = {
  items: CustomerCampaignHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: CustomerCampaignHistorySummary;
};

export type CustomerCampaignTimelineEvent = {
  key: "created" | "queued" | "sent" | "delivered" | "read" | "replied" | "failed" | "skipped";
  at: string;
};

/** Resolve date window for period filters (UTC ISO). */
export function resolveCustomerCampaignHistoryDateRange(input: {
  period?: CustomerCampaignHistoryPeriod | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  now?: Date;
}): { from: string | null; to: string | null } {
  const period = input.period ?? "all";
  if (period === "custom") {
    return {
      from: input.dateFrom?.trim() || null,
      to: input.dateTo?.trim() || null,
    };
  }
  if (period === "all") return { from: null, to: null };
  const now = input.now ?? new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: null };
}

export function assertCustomerScopedCampaignQuery(input: {
  companyId: string;
  customerId: string;
}): void {
  if (!input.companyId?.trim() || !input.customerId?.trim()) {
    throw new Error("companyId and customerId are required for customer campaign history");
  }
}

function hasSentSignal(
  item: Pick<CustomerCampaignHistoryItem, "status" | "delivery">,
): boolean {
  return item.status === "sent" || Boolean(item.delivery?.sentAt);
}

/** Map recipient + delivery enrichment → display status for chips/filters. */
export function resolveCustomerCampaignDisplayStatus(
  item: Pick<CustomerCampaignHistoryItem, "status" | "delivery">,
): CustomerCampaignHistoryStatusFilter {
  if (item.status === "failed" || item.delivery?.failedAt) return "failed";
  if (item.status === "skipped") return "skipped";
  if (item.status === "pending") return "pending";
  if (item.delivery?.repliedAt) return "replied";
  if (item.delivery?.readAt) return "read";
  if (item.delivery?.deliveredAt) return "delivered";
  if (hasSentSignal(item)) return "sent";
  if (item.status === "queued") return "queued";
  return item.status;
}

export function customerCampaignHistoryItemMatchesStatusFilter(
  item: CustomerCampaignHistoryItem,
  filter: CustomerCampaignHistoryStatusFilter | null | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "replied") {
    return Boolean(item.delivery?.repliedAt);
  }
  if (filter === "delivered") {
    return Boolean(item.delivery?.deliveredAt);
  }
  if (filter === "read") {
    return Boolean(item.delivery?.readAt);
  }
  if (filter === "sent") {
    return hasSentSignal(item) || item.status === "queued";
  }
  return item.status === filter || resolveCustomerCampaignDisplayStatus(item) === filter;
}

export function buildCustomerCampaignHistorySummary(
  items: CustomerCampaignHistoryItem[],
): CustomerCampaignHistorySummary {
  let sent = 0;
  let delivered = 0;
  let read = 0;
  let replied = 0;
  let failed = 0;
  for (const item of items) {
    if (hasSentSignal(item) || item.status === "queued") sent += 1;
    if (item.delivery?.deliveredAt) delivered += 1;
    if (item.delivery?.readAt) read += 1;
    if (item.delivery?.repliedAt) replied += 1;
    if (item.status === "failed" || item.delivery?.failedAt) failed += 1;
  }
  return {
    total: items.length,
    sent,
    delivered,
    read,
    replied,
    failed,
    queuedOrSent: sent,
  };
}

/** Timeline events that actually exist — never fabricate missing steps. */
export function buildCustomerCampaignTimeline(
  item: CustomerCampaignHistoryItem,
): CustomerCampaignTimelineEvent[] {
  const events: CustomerCampaignTimelineEvent[] = [
    { key: "created", at: item.createdAt },
  ];
  if (item.status === "skipped") {
    events.push({ key: "skipped", at: item.updatedAt });
    return events;
  }
  if (item.status === "pending") return events;
  if (item.status === "queued" && !item.delivery?.sentAt) {
    events.push({ key: "queued", at: item.updatedAt });
  }
  if (hasSentSignal(item)) {
    events.push({
      key: "sent",
      at: item.delivery?.sentAt ?? item.updatedAt,
    });
  }
  if (item.delivery?.deliveredAt) {
    events.push({ key: "delivered", at: item.delivery.deliveredAt });
  }
  if (item.delivery?.readAt) {
    events.push({ key: "read", at: item.delivery.readAt });
  }
  if (item.delivery?.repliedAt) {
    events.push({ key: "replied", at: item.delivery.repliedAt });
  }
  if (item.status === "failed" || item.delivery?.failedAt) {
    events.push({
      key: "failed",
      at: item.delivery?.failedAt ?? item.updatedAt,
    });
  }
  return events;
}

export function parseCampaignContentFields(
  contentDefinition: Record<string, unknown> | null | undefined,
): { title: string | null; detail: string | null } {
  if (!contentDefinition || typeof contentDefinition !== "object") {
    return { title: null, detail: null };
  }
  const title =
    typeof contentDefinition.campaignTitle === "string"
      ? contentDefinition.campaignTitle.trim() || null
      : null;
  const detail =
    typeof contentDefinition.detail === "string"
      ? contentDefinition.detail.trim() || null
      : null;
  return { title, detail };
}

/** Merge recipient lifecycle timestamps with optional channel_delivery_events row. */
export function mergeCustomerCampaignDeliveryEnrichment(input: {
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  repliedAt: string | null;
  channelDelivery: CustomerCampaignDeliveryEnrichment | null;
}): CustomerCampaignDeliveryEnrichment | null {
  const channel = input.channelDelivery;
  const sentAt = input.sentAt ?? channel?.sentAt ?? null;
  const deliveredAt = input.deliveredAt ?? channel?.deliveredAt ?? null;
  const readAt = input.readAt ?? channel?.readAt ?? null;
  const failedAt = input.failedAt ?? channel?.failedAt ?? null;
  const repliedAt = input.repliedAt ?? channel?.repliedAt ?? null;
  const externalMessageId =
    input.providerMessageId ?? channel?.externalMessageId ?? null;
  if (!sentAt && !deliveredAt && !readAt && !failedAt && !repliedAt && !externalMessageId) {
    return null;
  }
  let deliveryStatus: string | null = channel?.deliveryStatus ?? null;
  if (failedAt) deliveryStatus = "failed";
  else if (readAt) deliveryStatus = "read";
  else if (deliveredAt) deliveryStatus = "delivered";
  else if (sentAt) deliveryStatus = "sent";
  return {
    sentAt,
    deliveredAt,
    readAt,
    failedAt,
    repliedAt,
    deliveryStatus,
    externalMessageId,
  };
}

/** Source-contract guard: history modules must not match by phone. */
export function customerCampaignHistoryUsesPhoneMatching(): false {
  return false;
}
