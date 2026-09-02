import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import type { CommunicationDispatcher } from "@/lib/communication/dispatcher/communication-dispatcher";
import type { CommunicationSendResult } from "@/lib/communication/types/communication-types";
import { CampaignAudienceResolver } from "./audience-resolver";
import {
  hasWhatsAppOutboundPhoneCandidate,
  resolveWhatsAppOutboundPhone,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";
import {
  mapChannelOutboundToRecipientOutcome,
  META_MESSAGING_CAMPAIGN_BATCH_PAUSE_MS,
  META_MESSAGING_CAMPAIGN_BATCH_SIZE,
  runInBatches,
  type CampaignChannelOutboundPort,
} from "./channel-outbound-port";
import {
  MetaMessagingCampaignCapabilityChecker,
  type CampaignFeatureEntitlementPort,
} from "./meta-messaging-capability";
import { MarketingCampaignRepository } from "./repository";
import {
  CampaignThreadEligibilityResolver,
  renderMetaMessagingCampaignText,
  type MetaMessagingChannelKey,
} from "./thread-eligibility";
import {
  MarketingCampaignError,
  normalizeCampaignChannels,
  type CampaignAudienceCustomer,
  type CampaignAudienceDefinition,
  type CampaignChannelEligibilityPreview,
  type CampaignContentDefinition,
  type CampaignEligibilityPreviewResult,
  type CampaignExecuteResult,
  type CreateCampaignDraftInput,
  type MarketingCampaignChannel,
  type MarketingCampaignRecord,
  type MarketingCampaignRecipientRecord,
  type MarketingCampaignStatus,
} from "./types";
import { WhatsAppCampaignCapabilityChecker } from "./whatsapp-capability";
import { isCompanyFeatureEnabled } from "@/lib/billing/require-company-feature";

export const CAMPAIGNS_FEATURE_CODE = "campaigns" as const;

async function assertCampaignsEntitled(
  companyId: string,
  entitlement: CampaignFeatureEntitlementPort,
): Promise<void> {
  const entitled = await entitlement.isEnabled(companyId, CAMPAIGNS_FEATURE_CODE);
  if (!entitled) {
    throw new MarketingCampaignError("Campaigns feature is not entitled", "unauthorized");
  }
}

async function assertCanCreate(
  ctx: LoginAppPortContext,
  entitlement: CampaignFeatureEntitlementPort,
): Promise<void> {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission("campaigns.create")) {
    throw new MarketingCampaignError("Not authorized", "unauthorized");
  }
  await assertCampaignsEntitled(ctx.companyId, entitlement);
}

async function assertCanSend(
  ctx: LoginAppPortContext,
  entitlement: CampaignFeatureEntitlementPort,
): Promise<void> {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission("campaigns.send")) {
    throw new MarketingCampaignError("Not authorized", "unauthorized");
  }
  await assertCampaignsEntitled(ctx.companyId, entitlement);
}

function defaultCampaignEntitlement(client: SupabaseClient): CampaignFeatureEntitlementPort {
  return {
    isEnabled: (companyId, featureCode) => isCompanyFeatureEnabled(client, companyId, featureCode),
  };
}

function parseAudienceDefinition(
  audienceType: string,
  definition: Record<string, unknown>,
): CampaignAudienceDefinition {
  if (audienceType === "all") return { type: "all" };
  if (audienceType === "filtered") {
    const filters =
      (definition.filters as Record<string, unknown> | undefined) ?? definition;
    return {
      type: "filtered",
      filters: {
        search: typeof filters.search === "string" ? filters.search : null,
        gender: typeof filters.gender === "string" ? filters.gender : null,
        ageMin: typeof filters.ageMin === "number" ? filters.ageMin : null,
        ageMax: typeof filters.ageMax === "number" ? filters.ageMax : null,
        registeredFrom:
          typeof filters.registeredFrom === "string" ? filters.registeredFrom : null,
        registeredTo:
          typeof filters.registeredTo === "string" ? filters.registeredTo : null,
      },
    };
  }
  if (audienceType === "manual") {
    const ids = Array.isArray(definition.customerIds)
      ? definition.customerIds.filter((id): id is string => typeof id === "string")
      : [];
    return { type: "manual", customerIds: ids };
  }
  throw new MarketingCampaignError("Invalid audience_type", "invalid_input");
}

function serializeAudience(audience: CampaignAudienceDefinition): {
  audience_type: "all" | "filtered" | "manual";
  audience_definition: Record<string, unknown>;
} {
  if (audience.type === "all") {
    return { audience_type: "all", audience_definition: {} };
  }
  if (audience.type === "filtered") {
    return {
      audience_type: "filtered",
      audience_definition: { filters: audience.filters },
    };
  }
  return {
    audience_type: "manual",
    audience_definition: { customerIds: audience.customerIds },
  };
}

function parseContent(definition: Record<string, unknown>): CampaignContentDefinition {
  return {
    campaignTitle:
      typeof definition.campaignTitle === "string" ? definition.campaignTitle.trim() : "",
    detail: typeof definition.detail === "string" ? definition.detail.trim() : "",
  };
}

function recipientKey(customerId: string, channel: MarketingCampaignChannel): string {
  return `${customerId}:${channel}`;
}

/**
 * Map WhatsApp CommunicationDispatcher result → recipient status.
 * queued = notification_queue work created. Never treat queue success as sent.
 */
export function mapDispatcherResultToRecipientOutcome(
  phone: string | null | undefined,
  result: CommunicationSendResult | null,
): {
  status: "queued" | "failed" | "skipped";
  notification_queue_id: string | null;
  error_message: string | null;
} {
  if (!phone?.trim()) {
    return {
      status: "skipped",
      notification_queue_id: null,
      error_message: "Customer has no eligible WhatsApp destination",
    };
  }

  if (!result) {
    return {
      status: "failed",
      notification_queue_id: null,
      error_message: "dispatcher_unavailable",
    };
  }

  if (result.skippedChannels.includes("whatsapp") && !result.channelQueueIds?.whatsapp) {
    return {
      status: "skipped",
      notification_queue_id: null,
      error_message: "WhatsApp channel skipped by preferences or provider",
    };
  }

  if (result.failedChannels?.includes("whatsapp")) {
    return {
      status: "failed",
      notification_queue_id: null,
      error_message: "whatsapp_enqueue_failed",
    };
  }

  const queueId = result.channelQueueIds?.whatsapp ?? result.queueIds[0] ?? null;
  if (queueId) {
    return {
      status: "queued",
      notification_queue_id: queueId,
      error_message: null,
    };
  }

  return {
    status: "failed",
    notification_queue_id: null,
    error_message: "whatsapp_enqueue_failed",
  };
}

export type CampaignDispatcherFactory = (client: SupabaseClient) => CommunicationDispatcher;

export type MarketingCampaignServiceOptions = {
  channelOutbound?: CampaignChannelOutboundPort | null;
  entitlement?: CampaignFeatureEntitlementPort;
  nowMs?: () => number;
};

/**
 * Multi-channel campaign orchestration.
 * WhatsApp: CommunicationDispatcher → notification_queue (Phase 1 preserved).
 * Instagram/Messenger: CampaignChannelOutboundPort → channel platform (never adapters).
 */
export class MarketingCampaignService {
  private readonly repo: MarketingCampaignRepository;
  private readonly audience: CampaignAudienceResolver;
  private readonly whatsappCapability: WhatsAppCampaignCapabilityChecker;
  private readonly metaCapability: MetaMessagingCampaignCapabilityChecker;
  private readonly threadEligibility: CampaignThreadEligibilityResolver;
  private readonly channelOutbound: CampaignChannelOutboundPort | null;
  private readonly entitlement: CampaignFeatureEntitlementPort;

  constructor(
    private readonly client: SupabaseClient,
    private readonly dispatcherFactory: CampaignDispatcherFactory,
    options: MarketingCampaignServiceOptions = {},
  ) {
    this.repo = new MarketingCampaignRepository(client);
    this.audience = new CampaignAudienceResolver(client);
    this.entitlement = options.entitlement ?? defaultCampaignEntitlement(client);
    this.whatsappCapability = new WhatsAppCampaignCapabilityChecker(client, this.entitlement);
    this.metaCapability = new MetaMessagingCampaignCapabilityChecker(
      client,
      this.entitlement,
    );
    this.threadEligibility = new CampaignThreadEligibilityResolver(
      client,
      options.nowMs ?? (() => Date.now()),
    );
    this.channelOutbound = options.channelOutbound ?? null;
  }

  async createDraft(
    ctx: LoginAppPortContext,
    input: CreateCampaignDraftInput,
  ): Promise<MarketingCampaignRecord> {
    await assertCanCreate(ctx, this.entitlement);

    const name = input.name.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!name) throw new MarketingCampaignError("Name is required", "invalid_input");
    if (!idempotencyKey) {
      throw new MarketingCampaignError("Idempotency key is required", "invalid_input");
    }

    const content = {
      campaignTitle: input.content.campaignTitle.trim(),
      detail: input.content.detail.trim(),
    };
    if (!content.campaignTitle) {
      throw new MarketingCampaignError("campaignTitle is required", "invalid_input");
    }

    const channels = normalizeCampaignChannels(input.channels ?? ["whatsapp"]);
    if (channels.length === 0) {
      throw new MarketingCampaignError(
        "At least one supported channel is required (whatsapp, instagram, messenger)",
        "invalid_input",
      );
    }
    if ((input.channels ?? []).some((c) => String(c).toLowerCase() === "sms")) {
      throw new MarketingCampaignError("SMS is not a supported campaign channel", "invalid_input");
    }

    const existing = await this.repo.findByIdempotencyKey(ctx.companyId, idempotencyKey);
    if (existing) return existing;

    const audienceSerialized = serializeAudience(input.audience);

    try {
      return await this.repo.insertCampaign({
        company_id: ctx.companyId,
        name,
        status: "draft",
        audience_type: audienceSerialized.audience_type,
        audience_definition: audienceSerialized.audience_definition,
        channels,
        content_definition: content,
        created_by: ctx.actorUserId,
        idempotency_key: idempotencyKey,
        total_recipients_count: 0,
        queued_count: 0,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 0,
      });
    } catch (error) {
      const raced = await this.repo.findByIdempotencyKey(ctx.companyId, idempotencyKey);
      if (raced) return raced;
      throw error;
    }
  }

  async previewAudience(ctx: LoginAppPortContext, audience: CampaignAudienceDefinition) {
    await assertCanCreate(ctx, this.entitlement);
    return this.audience.resolve(ctx.companyId, audience);
  }

  /**
   * Preview-only eligibility counts. Never sends messages.
   * Reuses audience resolver + channel capability + thread eligibility.
   */
  async previewChannelEligibility(
    ctx: LoginAppPortContext,
    audience: CampaignAudienceDefinition,
    channelsInput: MarketingCampaignChannel[],
  ): Promise<CampaignEligibilityPreviewResult> {
    await assertCanCreate(ctx, this.entitlement);
    const channels = normalizeCampaignChannels(channelsInput);
    if (channels.length === 0) {
      throw new MarketingCampaignError(
        "At least one supported channel is required",
        "invalid_input",
      );
    }

    const resolved = await this.audience.resolve(ctx.companyId, audience);
    const availability = await this.resolveChannelAvailability(ctx.companyId, channels);
    const byChannel: CampaignChannelEligibilityPreview[] = [];

    for (const channel of channels) {
      const companyAvailable =
        channel === "whatsapp"
          ? availability.whatsapp
          : channel === "instagram"
            ? availability.instagram
            : availability.messenger;
      const unavailableReason =
        channel === "whatsapp"
          ? availability.whatsappReason
          : channel === "instagram"
            ? availability.instagramReason
            : availability.messengerReason;

      if (!companyAvailable) {
        byChannel.push({
          channel,
          companyAvailable: false,
          unavailableReason,
          eligible: 0,
          skipped: resolved.customers.length,
        });
        continue;
      }

      let eligible = 0;
      let skipped = 0;
      for (const customer of resolved.customers) {
        if (channel === "whatsapp") {
          if (hasWhatsAppOutboundPhoneCandidate(customer)) eligible += 1;
          else skipped += 1;
          continue;
        }
        const thread = await this.threadEligibility.resolveForCustomer({
          companyId: ctx.companyId,
          customerId: customer.id,
          channel,
        });
        if (thread.eligible) eligible += 1;
        else skipped += 1;
      }

      byChannel.push({
        channel,
        companyAvailable: true,
        unavailableReason: null,
        eligible,
        skipped,
      });
    }

    return {
      audienceCount:
        resolved.recipientCount +
        resolved.excludedOptedOutCount +
        resolved.excludedOtherCompanyCount +
        resolved.excludedMissingCount,
      marketingEligibleCount: resolved.recipientCount,
      excludedOptedOutCount: resolved.excludedOptedOutCount,
      excludedOtherCompanyCount: resolved.excludedOtherCompanyCount,
      excludedMissingCount: resolved.excludedMissingCount,
      byChannel,
    };
  }

  async listCampaigns(
    ctx: LoginAppPortContext,
    options?: { status?: MarketingCampaignStatus | null },
  ): Promise<MarketingCampaignRecord[]> {
    if (!ctx.isSuperAdmin && !ctx.hasPermission("campaigns.view")) {
      throw new MarketingCampaignError("Not authorized", "unauthorized");
    }
    if (!ctx.isSuperAdmin) {
      await assertCampaignsEntitled(ctx.companyId, this.entitlement);
    }
    return this.repo.listCampaigns(ctx.companyId, { status: options?.status });
  }

  async getCampaign(
    ctx: LoginAppPortContext,
    campaignId: string,
  ): Promise<MarketingCampaignRecord | null> {
    if (!ctx.isSuperAdmin && !ctx.hasPermission("campaigns.view")) {
      throw new MarketingCampaignError("Not authorized", "unauthorized");
    }
    if (!ctx.isSuperAdmin) {
      await assertCampaignsEntitled(ctx.companyId, this.entitlement);
    }
    return this.repo.findById(ctx.companyId, campaignId);
  }

  async listRecipients(ctx: LoginAppPortContext, campaignId: string) {
    if (!ctx.isSuperAdmin && !ctx.hasPermission("campaigns.view")) {
      throw new MarketingCampaignError("Not authorized", "unauthorized");
    }
    if (!ctx.isSuperAdmin) {
      await assertCampaignsEntitled(ctx.companyId, this.entitlement);
    }
    const campaign = await this.repo.findById(ctx.companyId, campaignId);
    if (!campaign) return [];
    return this.repo.listRecipientsForCampaign(campaignId, ctx.companyId);
  }

  async execute(
    ctx: LoginAppPortContext,
    input: { campaignId: string } | { idempotencyKey: string },
  ): Promise<CampaignExecuteResult> {
    await assertCanSend(ctx, this.entitlement);

    let campaign: MarketingCampaignRecord | null = null;
    if ("campaignId" in input) {
      campaign = await this.repo.findById(ctx.companyId, input.campaignId);
    } else {
      const key = input.idempotencyKey.trim();
      if (!key) throw new MarketingCampaignError("Idempotency key is required", "invalid_input");
      campaign = await this.repo.findByIdempotencyKey(ctx.companyId, key);
    }

    if (!campaign) {
      throw new MarketingCampaignError("Campaign not found", "campaign_not_found");
    }

    if (campaign.company_id !== ctx.companyId) {
      throw new MarketingCampaignError("Campaign not found", "campaign_not_found");
    }

    if (campaign.status === "completed") {
      return this.toExecuteResult(campaign, true);
    }

    if (campaign.status === "running") {
      return this.runRecipients(ctx, campaign, false);
    }

    if (campaign.status !== "draft" && campaign.status !== "failed") {
      throw new MarketingCampaignError(
        `Campaign status ${campaign.status} is not runnable`,
        "campaign_not_runnable",
      );
    }

    const channels = normalizeCampaignChannels(campaign.channels);
    if (channels.length === 0) {
      throw new MarketingCampaignError("Campaign has no supported channels", "invalid_input");
    }

    // Company-level capability: per-channel skip later if unavailable (don't abort other channels).
    // WhatsApp-only campaigns that are unavailable still fail fast (Phase 1 behavior).
    if (channels.length === 1 && channels[0] === "whatsapp") {
      const capability = await this.whatsappCapability.check(ctx.companyId);
      if (!capability.available) {
        await this.repo.updateCampaign(campaign.id, ctx.companyId, {
          status: "failed",
          error_message: `whatsapp_unavailable:${capability.reason}`,
          completed_at: new Date().toISOString(),
        });
        throw new MarketingCampaignError(
          `WhatsApp is not available (${capability.reason})`,
          "whatsapp_unavailable",
        );
      }
    }

    const claimed = await this.repo.tryClaimRunning(campaign.id, ctx.companyId);
    if (!claimed) {
      const latest = await this.repo.findById(ctx.companyId, campaign.id);
      if (latest?.status === "completed") return this.toExecuteResult(latest, true);
      if (latest?.status === "running") {
        return this.runRecipients(ctx, latest, false);
      }
      throw new MarketingCampaignError(
        "Campaign could not be claimed for execution",
        "duplicate_in_progress",
      );
    }

    return this.runRecipients(ctx, claimed, false);
  }

  private async runRecipients(
    ctx: LoginAppPortContext,
    campaign: MarketingCampaignRecord,
    reusedExisting: boolean,
  ): Promise<CampaignExecuteResult> {
    const audience = parseAudienceDefinition(
      campaign.audience_type,
      campaign.audience_definition ?? {},
    );
    const resolved = await this.audience.resolve(ctx.companyId, audience);
    const content = parseContent(campaign.content_definition ?? {});
    if (!content.campaignTitle.trim()) {
      throw new MarketingCampaignError("campaignTitle is required", "invalid_input");
    }

    const channels = normalizeCampaignChannels(campaign.channels);
    const existing = await this.repo.listRecipientsForCampaign(campaign.id, ctx.companyId);
    const byKey = new Map(existing.map((row) => [recipientKey(row.customer_id, row.channel), row]));

    const channelAvailability = await this.resolveChannelAvailability(ctx.companyId, channels);

    type WorkItem = {
      customer: CampaignAudienceCustomer;
      channel: MarketingCampaignChannel;
    };
    const whatsappWork: WorkItem[] = [];
    const metaWork: WorkItem[] = [];

    for (const customer of resolved.customers) {
      for (const channel of channels) {
        const key = recipientKey(customer.id, channel);
        const prior = byKey.get(key);
        if (prior && (prior.status === "queued" || prior.status === "sent" || prior.status === "skipped")) {
          continue;
        }
        if (channel === "whatsapp") whatsappWork.push({ customer, channel });
        else metaWork.push({ customer, channel });
      }
    }

    const dispatcher = this.dispatcherFactory(this.client);

    for (const item of whatsappWork) {
      await this.processWhatsAppRecipient({
        ctx,
        campaign,
        customer: item.customer,
        content,
        dispatcher,
        byKey,
        channelAvailable: channelAvailability.whatsapp,
        unavailableReason: channelAvailability.whatsappReason,
      });
    }

    await runInBatches(
      metaWork,
      META_MESSAGING_CAMPAIGN_BATCH_SIZE,
      META_MESSAGING_CAMPAIGN_BATCH_PAUSE_MS,
      async (item) => {
        const channel = item.channel as MetaMessagingChannelKey;
        const available =
          channel === "instagram" ? channelAvailability.instagram : channelAvailability.messenger;
        const unavailableReason =
          channel === "instagram"
            ? channelAvailability.instagramReason
            : channelAvailability.messengerReason;
        await this.processMetaMessagingRecipient({
          ctx,
          campaign,
          customer: item.customer,
          channel,
          content,
          byKey,
          channelAvailable: available,
          unavailableReason,
        });
      },
    );

    const recipients = await this.repo.listRecipientsForCampaign(campaign.id, ctx.companyId);
    const counts = this.repo.recountFromRecipients(recipients);
    const finalStatus =
      recipients.length > 0 &&
      counts.queued_count === 0 &&
      counts.sent_count === 0 &&
      counts.skipped_count === 0 &&
      counts.failed_count > 0
        ? "failed"
        : "completed";

    const updated = await this.repo.updateCampaign(campaign.id, ctx.companyId, {
      ...counts,
      status: finalStatus,
      completed_at: new Date().toISOString(),
      error_message: finalStatus === "failed" ? "All recipient channel attempts failed" : null,
    });

    return this.toExecuteResult(updated, reusedExisting, recipients);
  }

  private async resolveChannelAvailability(
    companyId: string,
    channels: MarketingCampaignChannel[],
  ): Promise<{
    whatsapp: boolean;
    whatsappReason: string | null;
    instagram: boolean;
    instagramReason: string | null;
    messenger: boolean;
    messengerReason: string | null;
  }> {
    const result = {
      whatsapp: true,
      whatsappReason: null as string | null,
      instagram: true,
      instagramReason: null as string | null,
      messenger: true,
      messengerReason: null as string | null,
    };

    if (channels.includes("whatsapp")) {
      const check = await this.whatsappCapability.check(companyId);
      result.whatsapp = check.available;
      result.whatsappReason = check.available ? null : `whatsapp_unavailable:${check.reason}`;
    }
    if (channels.includes("instagram")) {
      const check = await this.metaCapability.check(companyId, "instagram");
      result.instagram = check.available;
      result.instagramReason = check.available ? null : `instagram_unavailable:${check.reason}`;
    }
    if (channels.includes("messenger")) {
      const check = await this.metaCapability.check(companyId, "messenger");
      result.messenger = check.available;
      result.messengerReason = check.available ? null : `messenger_unavailable:${check.reason}`;
    }

    return result;
  }

  private async claimOrResumeRecipient(input: {
    campaignId: string;
    companyId: string;
    customerId: string;
    channel: MarketingCampaignChannel;
    byKey: Map<string, MarketingCampaignRecipientRecord>;
  }): Promise<MarketingCampaignRecipientRecord | null> {
    const key = recipientKey(input.customerId, input.channel);
    let recipient = input.byKey.get(key) ?? null;

    if (!recipient) {
      recipient = await this.repo.tryClaimRecipient({
        campaign_id: input.campaignId,
        company_id: input.companyId,
        customer_id: input.customerId,
        channel: input.channel,
      });
      if (recipient) input.byKey.set(key, recipient);
    }

    if (!recipient) return null;
    if (recipient.status === "queued" || recipient.status === "sent" || recipient.status === "skipped") {
      return null;
    }

    if (recipient.status === "failed") {
      await this.repo.updateRecipient(recipient.id, input.companyId, {
        status: "pending",
        notification_queue_id: null,
        channel_delivery_event_id: null,
        provider_message_id: null,
        error_message: null,
      });
      recipient = { ...recipient, status: "pending", error_message: null };
      input.byKey.set(key, recipient);
    }

    return recipient;
  }

  private async processWhatsAppRecipient(input: {
    ctx: LoginAppPortContext;
    campaign: MarketingCampaignRecord;
    customer: CampaignAudienceCustomer;
    content: CampaignContentDefinition;
    dispatcher: CommunicationDispatcher;
    byKey: Map<string, MarketingCampaignRecipientRecord>;
    channelAvailable: boolean;
    unavailableReason: string | null;
  }): Promise<void> {
    const recipient = await this.claimOrResumeRecipient({
      campaignId: input.campaign.id,
      companyId: input.ctx.companyId,
      customerId: input.customer.id,
      channel: "whatsapp",
      byKey: input.byKey,
    });
    if (!recipient) return;

    if (!input.channelAvailable) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        error_message: input.unavailableReason ?? "whatsapp_unavailable",
      });
      return;
    }

    const outbound = resolveWhatsAppOutboundPhone(input.customer);
    if (!outbound.ok) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        notification_queue_id: null,
        error_message:
          outbound.reason === "missing_phone"
            ? "Customer has no eligible WhatsApp destination"
            : "phone_identity_unresolved",
      });
      return;
    }

    let sendResult: CommunicationSendResult | null = null;
    try {
      sendResult = await input.dispatcher.send({
        companyId: input.ctx.companyId,
        templateKey: "marketing_campaign",
        channels: ["whatsapp"],
        recipient: {
          customerId: input.customer.id,
          name: input.customer.name,
          phone: outbound.phone,
          email: input.customer.email,
        },
        variables: {
          customerName: input.customer.name,
          campaignTitle: input.content.campaignTitle,
          detail: input.content.detail,
        },
        idempotencyKey: `campaign:${input.campaign.id}:customer:${input.customer.id}:whatsapp`,
        metadata: {
          campaignId: input.campaign.id,
          campaignRecipientId: recipient.id,
        },
      });
    } catch (error) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "failed",
        notification_queue_id: null,
        error_message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const outcome = mapDispatcherResultToRecipientOutcome(outbound.phone, sendResult);
    await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
      status: outcome.status,
      notification_queue_id: outcome.notification_queue_id,
      error_message: outcome.error_message,
    });
  }

  private async processMetaMessagingRecipient(input: {
    ctx: LoginAppPortContext;
    campaign: MarketingCampaignRecord;
    customer: CampaignAudienceCustomer;
    channel: MetaMessagingChannelKey;
    content: CampaignContentDefinition;
    byKey: Map<string, MarketingCampaignRecipientRecord>;
    channelAvailable: boolean;
    unavailableReason: string | null;
  }): Promise<void> {
    const recipient = await this.claimOrResumeRecipient({
      campaignId: input.campaign.id,
      companyId: input.ctx.companyId,
      customerId: input.customer.id,
      channel: input.channel,
      byKey: input.byKey,
    });
    if (!recipient) return;

    if (!input.channelAvailable) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        error_message: input.unavailableReason ?? `${input.channel}_unavailable`,
      });
      return;
    }

    if (!this.channelOutbound) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "failed",
        error_message: "channel_outbound_port_not_configured",
      });
      return;
    }

    const eligibility = await this.threadEligibility.resolveForCustomer({
      companyId: input.ctx.companyId,
      customerId: input.customer.id,
      channel: input.channel,
    });

    if (!eligibility.eligible) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        error_message: eligibility.reason,
      });
      return;
    }

    const text = renderMetaMessagingCampaignText(input.content);
    if (!text.trim()) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "failed",
        error_message: "empty_campaign_content",
      });
      return;
    }

    try {
      const dispatchResult = await this.channelOutbound.dispatch({
        companyId: input.ctx.companyId,
        companyChannelId: eligibility.binding.companyChannelId,
        channelKey: input.channel,
        conversationId: eligibility.binding.conversationId,
        channelSessionId: eligibility.binding.channelSessionId,
        externalThreadId: eligibility.binding.externalThreadId,
        text,
        metadata: {
          source: "marketing_campaign",
          campaignId: input.campaign.id,
          campaignRecipientId: recipient.id,
          customerId: input.customer.id,
        },
      });

      const outcome = mapChannelOutboundToRecipientOutcome(dispatchResult);
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: outcome.status,
        channel_delivery_event_id: outcome.channel_delivery_event_id,
        provider_message_id: outcome.provider_message_id,
        error_message: outcome.error_message,
      });
    } catch (error) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private toExecuteResult(
    campaign: MarketingCampaignRecord,
    reusedExisting: boolean,
    recipients?: MarketingCampaignRecipientRecord[],
  ): CampaignExecuteResult {
    const channelCounts = recipients
      ? this.repo.recountByChannel(recipients).map((row) => ({
          channel: row.channel,
          total: row.total,
          queued: row.queued,
          sent: row.sent,
          failed: row.failed,
          skipped: row.skipped,
        }))
      : [];

    return {
      campaignId: campaign.id,
      status: campaign.status,
      totalRecipientsCount: campaign.total_recipients_count,
      queuedCount: campaign.queued_count,
      sentCount: campaign.sent_count,
      failedCount: campaign.failed_count,
      skippedCount: campaign.skipped_count,
      channelCounts,
      reusedExisting,
      queueSucceeded: campaign.queued_count > 0,
    };
  }
}
