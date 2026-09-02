import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertCustomerScopedCampaignQuery,
  CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE,
  customerCampaignHistoryItemMatchesStatusFilter,
  mergeCustomerCampaignDeliveryEnrichment,
  parseCampaignContentFields,
  resolveCustomerCampaignHistoryDateRange,
  type CustomerCampaignDeliveryEnrichment,
  type CustomerCampaignHistoryItem,
  type CustomerCampaignHistoryQuery,
  type CustomerCampaignHistoryResult,
} from "./customer-campaign-history";
import type {
  MarketingCampaignChannel,
  MarketingCampaignRecipientRecord,
  MarketingCampaignRecipientStatus,
  MarketingCampaignRecord,
  MarketingCampaignStatus,
} from "./types";

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /duplicate key|unique constraint/i.test(message);
}

export class MarketingCampaignRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<MarketingCampaignRecord | null> {
    const { data, error } = await this.client
      .from("marketing_campaigns")
      .select("*")
      .eq("company_id", companyId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecord | null) ?? null;
  }

  async findById(
    companyId: string,
    campaignId: string,
  ): Promise<MarketingCampaignRecord | null> {
    const { data, error } = await this.client
      .from("marketing_campaigns")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecord | null) ?? null;
  }

  async listCampaigns(
    companyId: string,
    options?: { status?: MarketingCampaignStatus | null; limit?: number },
  ): Promise<MarketingCampaignRecord[]> {
    let query = this.client
      .from("marketing_campaigns")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 100);

    if (options?.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecord[]) ?? [];
  }

  async insertCampaign(
    values: Omit<
      MarketingCampaignRecord,
      "id" | "created_at" | "updated_at" | "started_at" | "completed_at" | "error_message"
    > & {
      id?: string;
      error_message?: string | null;
      started_at?: string | null;
      completed_at?: string | null;
    },
  ): Promise<MarketingCampaignRecord> {
    const { data, error } = await this.client
      .from("marketing_campaigns")
      .insert(values)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as MarketingCampaignRecord;
  }

  async updateCampaign(
    id: string,
    companyId: string,
    patch: Partial<MarketingCampaignRecord>,
  ): Promise<MarketingCampaignRecord> {
    const { data, error } = await this.client
      .from("marketing_campaigns")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as MarketingCampaignRecord;
  }

  /**
   * Conditional claim: only draft/failed may move to running.
   * Returns null when another worker already claimed or status is not runnable.
   */
  async tryClaimRunning(
    id: string,
    companyId: string,
  ): Promise<MarketingCampaignRecord | null> {
    const { data, error } = await this.client
      .from("marketing_campaigns")
      .update({
        status: "running" satisfies MarketingCampaignStatus,
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .in("status", ["draft", "failed"])
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecord | null) ?? null;
  }

  /**
   * Durable per-recipient claim. Unique (campaign_id, customer_id, channel)
   * prevents duplicate queue creation under concurrency / retries.
   */
  async tryClaimRecipient(values: {
    campaign_id: string;
    company_id: string;
    customer_id: string;
    channel: MarketingCampaignChannel;
  }): Promise<MarketingCampaignRecipientRecord | null> {
    const { data, error } = await this.client
      .from("marketing_campaign_recipients")
      .insert({
        ...values,
        status: "pending" satisfies MarketingCampaignRecipientStatus,
      })
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) return null;
      throw new Error(error.message);
    }
    return data as MarketingCampaignRecipientRecord;
  }

  async findRecipient(
    campaignId: string,
    companyId: string,
    customerId: string,
    channel: MarketingCampaignChannel,
  ): Promise<MarketingCampaignRecipientRecord | null> {
    const { data, error } = await this.client
      .from("marketing_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("channel", channel)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecipientRecord | null) ?? null;
  }

  async updateRecipient(
    id: string,
    companyId: string,
    patch: Partial<{
      status: MarketingCampaignRecipientStatus;
      notification_queue_id: string | null;
      channel_delivery_event_id: string | null;
      provider_message_id: string | null;
      error_message: string | null;
      sent_at: string | null;
      delivered_at: string | null;
      read_at: string | null;
      failed_at: string | null;
      replied_at: string | null;
    }>,
  ): Promise<void> {
    const { error } = await this.client
      .from("marketing_campaign_recipients")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async listRecipientsForCampaign(
    campaignId: string,
    companyId: string,
  ): Promise<MarketingCampaignRecipientRecord[]> {
    const { data, error } = await this.client
      .from("marketing_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return (data as MarketingCampaignRecipientRecord[]) ?? [];
  }

  /**
   * Customer-scoped campaign history read model.
   * Always filters by company_id + customer_id — never by phone.
   */
  async listCustomerCampaignHistory(
    input: CustomerCampaignHistoryQuery,
  ): Promise<CustomerCampaignHistoryResult> {
    assertCustomerScopedCampaignQuery(input);
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      100,
      Math.max(1, input.pageSize ?? CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE),
    );
    const { from, to } = resolveCustomerCampaignHistoryDateRange({
      period: input.period,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    let query = this.client
      .from("marketing_campaign_recipients")
      .select(
        `
        id,
        campaign_id,
        company_id,
        customer_id,
        channel,
        status,
        notification_queue_id,
        channel_delivery_event_id,
        provider_message_id,
        error_message,
        sent_at,
        delivered_at,
        read_at,
        failed_at,
        replied_at,
        created_at,
        updated_at,
        marketing_campaigns!inner (
          id,
          name,
          status,
          content_definition,
          company_id
        )
      `,
        { count: "exact" },
      )
      .eq("company_id", input.companyId)
      .eq("customer_id", input.customerId)
      .eq("marketing_campaigns.company_id", input.companyId)
      .order("created_at", { ascending: false });

    if (input.channel && input.channel !== "all") {
      query = query.eq("channel", input.channel);
    }
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    // Durable recipient statuses can be pushed to SQL; delivery-enriched filters apply in-memory after join.
    const status = input.status ?? "all";
    if (
      status === "pending" ||
      status === "queued" ||
      status === "failed" ||
      status === "skipped"
    ) {
      query = query.eq("status", status);
    } else if (status === "sent") {
      query = query.in("status", ["queued", "sent"]);
    }

    const fromIdx = (page - 1) * pageSize;
    const { data, error, count } = await query.range(fromIdx, fromIdx + pageSize - 1);
    if (error) throw new Error(error.message);

    type Row = {
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
      sent_at: string | null;
      delivered_at: string | null;
      read_at: string | null;
      failed_at: string | null;
      replied_at: string | null;
      created_at: string;
      updated_at: string;
      marketing_campaigns:
        | {
            id: string;
            name: string;
            status: string;
            content_definition: Record<string, unknown> | null;
            company_id: string;
          }
        | {
            id: string;
            name: string;
            status: string;
            content_definition: Record<string, unknown> | null;
            company_id: string;
          }[]
        | null;
    };

    const rows = (data as Row[] | null) ?? [];
    const deliveryIds = [
      ...new Set(
        rows
          .map((r) => r.channel_delivery_event_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const deliveryById = new Map<string, CustomerCampaignDeliveryEnrichment>();
    if (deliveryIds.length > 0) {
      const { data: events, error: eventsError } = await this.client
        .from("channel_delivery_events")
        .select(
          "id, company_id, delivery_status, sent_at, delivered_at, read_at, failed_at, external_message_id",
        )
        .eq("company_id", input.companyId)
        .in("id", deliveryIds);
      if (eventsError) throw new Error(eventsError.message);
      for (const ev of events ?? []) {
        deliveryById.set(String(ev.id), {
          sentAt: typeof ev.sent_at === "string" ? ev.sent_at : null,
          deliveredAt: typeof ev.delivered_at === "string" ? ev.delivered_at : null,
          readAt: typeof ev.read_at === "string" ? ev.read_at : null,
          failedAt: typeof ev.failed_at === "string" ? ev.failed_at : null,
          repliedAt: null,
          deliveryStatus:
            typeof ev.delivery_status === "string" ? ev.delivery_status : null,
          externalMessageId:
            typeof ev.external_message_id === "string" ? ev.external_message_id : null,
        });
      }
    }

    let items: CustomerCampaignHistoryItem[] = rows.map((row) => {
      const campaignRaw = Array.isArray(row.marketing_campaigns)
        ? row.marketing_campaigns[0]
        : row.marketing_campaigns;
      const content = parseCampaignContentFields(campaignRaw?.content_definition ?? null);
      const channelDelivery = row.channel_delivery_event_id
        ? deliveryById.get(row.channel_delivery_event_id) ?? null
        : null;
      return {
        recipientId: row.id,
        campaignId: row.campaign_id,
        companyId: row.company_id,
        customerId: row.customer_id,
        channel: row.channel,
        status: row.status,
        notificationQueueId: row.notification_queue_id,
        channelDeliveryEventId: row.channel_delivery_event_id,
        providerMessageId: row.provider_message_id,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        campaignName: campaignRaw?.name ?? "",
        campaignStatus: campaignRaw?.status ?? "",
        contentTitle: content.title,
        contentDetail: content.detail,
        delivery: mergeCustomerCampaignDeliveryEnrichment({
          providerMessageId: row.provider_message_id,
          sentAt: row.sent_at,
          deliveredAt: row.delivered_at,
          readAt: row.read_at,
          failedAt: row.failed_at,
          repliedAt: row.replied_at,
          channelDelivery,
        }),
      };
    });

    if (
      status === "delivered" ||
      status === "read" ||
      status === "replied"
    ) {
      items = items.filter((item) =>
        customerCampaignHistoryItemMatchesStatusFilter(item, status),
      );
    }

    const summary = await this.summarizeCustomerCampaignHistory({
      companyId: input.companyId,
      customerId: input.customerId,
      channel: input.channel,
      period: input.period,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    return {
      items,
      total:
        status === "delivered" || status === "read" || status === "replied"
          ? items.length
          : typeof count === "number"
            ? count
            : items.length,
      page,
      pageSize,
      summary,
    };
  }

  /**
   * Aggregate cards for a customer (company + customer scoped).
   * sent/delivered/read/replied/failed come from recipient lifecycle timestamps
   * (and linked channel_delivery_events) — never invented.
   */
  async summarizeCustomerCampaignHistory(input: {
    companyId: string;
    customerId: string;
    channel?: CustomerCampaignHistoryQuery["channel"];
    period?: CustomerCampaignHistoryQuery["period"];
    dateFrom?: string | null;
    dateTo?: string | null;
  }): Promise<import("./customer-campaign-history").CustomerCampaignHistorySummary> {
    assertCustomerScopedCampaignQuery(input);
    const { from, to } = resolveCustomerCampaignHistoryDateRange({
      period: input.period,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    let query = this.client
      .from("marketing_campaign_recipients")
      .select(
        "id, status, channel_delivery_event_id, sent_at, delivered_at, read_at, failed_at, replied_at",
      )
      .eq("company_id", input.companyId)
      .eq("customer_id", input.customerId);

    if (input.channel && input.channel !== "all") {
      query = query.eq("channel", input.channel);
    }
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query.limit(2000);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const deliveryIds = [
      ...new Set(
        rows
          .map((r) =>
            typeof r.channel_delivery_event_id === "string"
              ? r.channel_delivery_event_id
              : null,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const channelDeliveredIds = new Set<string>();
    const channelReadIds = new Set<string>();
    const channelFailedIds = new Set<string>();
    if (deliveryIds.length > 0) {
      const { data: events, error: eventsError } = await this.client
        .from("channel_delivery_events")
        .select("id, delivered_at, read_at, failed_at")
        .eq("company_id", input.companyId)
        .in("id", deliveryIds);
      if (eventsError) throw new Error(eventsError.message);
      for (const ev of events ?? []) {
        const id = String(ev.id);
        if (ev.delivered_at) channelDeliveredIds.add(id);
        if (ev.read_at) channelReadIds.add(id);
        if (ev.failed_at) channelFailedIds.add(id);
      }
    }

    let sent = 0;
    let delivered = 0;
    let read = 0;
    let replied = 0;
    let failed = 0;
    for (const row of rows) {
      const status = String(row.status);
      const deliveryId =
        typeof row.channel_delivery_event_id === "string"
          ? row.channel_delivery_event_id
          : null;
      if (status === "sent" || status === "queued" || row.sent_at) sent += 1;
      if (row.delivered_at || (deliveryId && channelDeliveredIds.has(deliveryId))) {
        delivered += 1;
      }
      if (row.read_at || (deliveryId && channelReadIds.has(deliveryId))) {
        read += 1;
      }
      if (row.replied_at) replied += 1;
      if (
        status === "failed" ||
        row.failed_at ||
        (deliveryId && channelFailedIds.has(deliveryId))
      ) {
        failed += 1;
      }
    }

    return {
      total: rows.length,
      sent,
      delivered,
      read,
      replied,
      failed,
      queuedOrSent: sent,
    };
  }

  recountFromRecipients(recipients: MarketingCampaignRecipientRecord[]): {
    total_recipients_count: number;
    queued_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
  } {
    let queued = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of recipients) {
      if (row.status === "queued") queued += 1;
      else if (row.status === "sent") sent += 1;
      else if (row.status === "failed") failed += 1;
      else if (row.status === "skipped") skipped += 1;
    }
    return {
      total_recipients_count: recipients.length,
      queued_count: queued,
      sent_count: sent,
      failed_count: failed,
      skipped_count: skipped,
    };
  }

  recountByChannel(recipients: MarketingCampaignRecipientRecord[]): Array<{
    channel: MarketingCampaignChannel;
    total: number;
    queued: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const map = new Map<
      MarketingCampaignChannel,
      { total: number; queued: number; sent: number; failed: number; skipped: number }
    >();
    for (const row of recipients) {
      const bucket = map.get(row.channel) ?? {
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      };
      bucket.total += 1;
      if (row.status === "queued") bucket.queued += 1;
      else if (row.status === "sent") bucket.sent += 1;
      else if (row.status === "failed") bucket.failed += 1;
      else if (row.status === "skipped") bucket.skipped += 1;
      map.set(row.channel, bucket);
    }
    return [...map.entries()].map(([channel, counts]) => ({ channel, ...counts }));
  }
}
