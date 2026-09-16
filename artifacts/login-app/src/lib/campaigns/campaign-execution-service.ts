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
import { buildMessagingPresence } from "./campaign-customer-channel-availability";
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
  campaignEmailChannelVariables,
  campaignTextChannelVariables,
  parseCampaignContentDefinition,
} from "./campaign-content";
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
import {
  EmailCampaignCapabilityChecker,
  hasCampaignOutboundEmail,
  resolveCampaignOutboundEmail,
} from "./email-capability";
import {
  SmsCampaignCapabilityChecker,
  hasCampaignOutboundSms,
  resolveCampaignOutboundSms,
} from "./sms-capability";
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

function parseContent(
  definition: Record<string, unknown>,
  companyId?: string,
): CampaignContentDefinition {
  return parseCampaignContentDefinition(definition, companyId);
}

function recipientKey(customerId: string, channel: MarketingCampaignChannel): string {
  return `${customerId}:${channel}`;
}

/**
 * Map WhatsApp CommunicationDispatcher result → recipient status.
 * queued = notification_queue work created. Never treat queue success as sent.
 */
function dispatcherMissingDestinationMessage(channel: "whatsapp" | "email" | "sms"): string {
  if (channel === "email") return "Customer has no eligible email destination";
  if (channel === "sms") return "Customer has no eligible SMS destination";
  return "Customer has no eligible WhatsApp destination";
}

function dispatcherEnqueueFailedMessage(channel: "whatsapp" | "email" | "sms"): string {
  if (channel === "email") return "email_enqueue_failed";
  if (channel === "sms") return "sms_enqueue_failed";
  return "whatsapp_enqueue_failed";
}

export function mapDispatcherResultToRecipientOutcome(
  destination: string | null | undefined,
  result: CommunicationSendResult | null,
  channel: "whatsapp" | "email" | "sms" = "whatsapp",
): {
  status: "queued" | "failed" | "skipped";
  notification_queue_id: string | null;
  error_message: string | null;
} {
  if (!destination?.trim()) {
    return {
      status: "skipped",
      notification_queue_id: null,
      error_message: dispatcherMissingDestinationMessage(channel),
    };
  }

  if (!result) {
    return {
      status: "failed",
      notification_queue_id: null,
      error_message: "dispatcher_unavailable",
    };
  }

  if (result.skippedChannels.includes(channel) && !result.channelQueueIds?.[channel]) {
    return {
      status: "skipped",
      notification_queue_id: null,
      error_message:
        channel === "email"
          ? "Email channel skipped by preferences or provider"
          : channel === "sms"
            ? "SMS channel skipped by preferences or provider"
            : "WhatsApp channel skipped by preferences or provider",
    };
  }

  if (result.failedChannels?.includes(channel)) {
    return {
      status: "failed",
      notification_queue_id: null,
      error_message: dispatcherEnqueueFailedMessage(channel),
    };
  }

  const queueId = result.channelQueueIds?.[channel] ?? result.queueIds[0] ?? null;
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
    error_message: dispatcherEnqueueFailedMessage(channel),
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
 * WhatsApp/Email/SMS: CommunicationDispatcher → notification_queue.
 * Instagram/Messenger: CampaignChannelOutboundPort → channel platform (never adapters).
 */
export class MarketingCampaignService {
  private readonly repo: MarketingCampaignRepository;
  private readonly audience: CampaignAudienceResolver;
  private readonly whatsappCapability: WhatsAppCampaignCapabilityChecker;
  private readonly emailCapability: EmailCampaignCapabilityChecker;
  private readonly smsCapability: SmsCampaignCapabilityChecker;
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
    this.emailCapability = new EmailCampaignCapabilityChecker(client, this.entitlement);
    this.smsCapability = new SmsCampaignCapabilityChecker(client, this.entitlement);
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

    const content = parseCampaignContentDefinition(
      {
        campaignTitle: input.content.campaignTitle,
        detail: input.content.detail,
        attachments: input.content.attachments ?? [],
      },
      ctx.companyId,
    );
    if (!content.campaignTitle) {
      throw new MarketingCampaignError("campaignTitle is required", "invalid_input");
    }
    if ((input.content.attachments?.length ?? 0) > 0 && content.attachments?.length !== input.content.attachments?.length) {
      throw new MarketingCampaignError("One or more campaign attachments are invalid", "invalid_input");
    }

    const channels = normalizeCampaignChannels(input.channels ?? ["whatsapp"]);
    if (channels.length === 0) {
      throw new MarketingCampaignError(
        "At least one supported channel is required (whatsapp, instagram, messenger, email, sms)",
        "invalid_input",
      );
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
    const needsMessagingPresence = channels.some(
      (channel) => channel === "instagram" || channel === "messenger",
    );
    let messagingPresence = new Map<string, Set<"instagram" | "messenger">>();
    if (needsMessagingPresence && resolved.customers.length > 0) {
      const { data, error } = await this.client
        .from("conversations")
        .select("customer_id, channel_type")
        .eq("company_id", ctx.companyId)
        .in("channel_type", ["instagram", "messenger"])
        .is("deleted_at", null)
        .in(
          "customer_id",
          resolved.customers.map((customer) => customer.id),
        );
      if (error) throw new Error(error.message);
      messagingPresence = buildMessagingPresence(data ?? []);
    }
    const byChannel: CampaignChannelEligibilityPreview[] = [];

    for (const channel of channels) {
      const companyAvailable =
        channel === "whatsapp"
          ? availability.whatsapp
          : channel === "email"
            ? availability.email
            : channel === "sms"
              ? availability.sms
              : channel === "instagram"
                ? availability.instagram
                : availability.messenger;
      const unavailableReason =
        channel === "whatsapp"
          ? availability.whatsappReason
          : channel === "email"
            ? availability.emailReason
            : channel === "sms"
              ? availability.smsReason
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
        if (channel === "email") {
          if (hasCampaignOutboundEmail(customer)) eligible += 1;
          else skipped += 1;
          continue;
        }
        if (channel === "sms") {
          if (hasCampaignOutboundSms(customer)) eligible += 1;
          else skipped += 1;
          continue;
        }
        if (
          (channel === "instagram" || channel === "messenger") &&
          messagingPresence.get(customer.id)?.has(channel) === true
        ) {
          eligible += 1;
        } else {
          skipped += 1;
        }
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
    // Single-channel WhatsApp/Email/SMS campaigns that are unavailable still fail fast (Phase 1 behavior).
    if (
      channels.length === 1 &&
      (channels[0] === "whatsapp" || channels[0] === "email" || channels[0] === "sms")
    ) {
      const sole = channels[0];
      const capability =
        sole === "email"
          ? await this.emailCapability.check(ctx.companyId)
          : sole === "sms"
            ? await this.smsCapability.check(ctx.companyId)
            : await this.whatsappCapability.check(ctx.companyId);
      if (!capability.available) {
        const prefix =
          sole === "email"
            ? "email_unavailable"
            : sole === "sms"
              ? "sms_unavailable"
              : "whatsapp_unavailable";
        await this.repo.updateCampaign(campaign.id, ctx.companyId, {
          status: "failed",
          error_message: `${prefix}:${capability.reason}`,
          completed_at: new Date().toISOString(),
        });
        throw new MarketingCampaignError(
          `${sole === "email" ? "Email" : sole === "sms" ? "SMS" : "WhatsApp"} is not available (${capability.reason})`,
          sole === "whatsapp" ? "whatsapp_unavailable" : "channel_unavailable",
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
    const content = parseContent(campaign.content_definition ?? {}, ctx.companyId);
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
    const emailWork: WorkItem[] = [];
    const smsWork: WorkItem[] = [];
    const metaWork: WorkItem[] = [];

    for (const customer of resolved.customers) {
      for (const channel of channels) {
        const key = recipientKey(customer.id, channel);
        const prior = byKey.get(key);
        if (prior && (prior.status === "queued" || prior.status === "sent" || prior.status === "skipped")) {
          continue;
        }
        if (channel === "whatsapp") whatsappWork.push({ customer, channel });
        else if (channel === "email") emailWork.push({ customer, channel });
        else if (channel === "sms") smsWork.push({ customer, channel });
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

    for (const item of emailWork) {
      await this.processEmailRecipient({
        ctx,
        campaign,
        customer: item.customer,
        content,
        dispatcher,
        byKey,
        channelAvailable: channelAvailability.email,
        unavailableReason: channelAvailability.emailReason,
      });
    }

    for (const item of smsWork) {
      await this.processSmsRecipient({
        ctx,
        campaign,
        customer: item.customer,
        content,
        dispatcher,
        byKey,
        channelAvailable: channelAvailability.sms,
        unavailableReason: channelAvailability.smsReason,
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
    email: boolean;
    emailReason: string | null;
    sms: boolean;
    smsReason: string | null;
    instagram: boolean;
    instagramReason: string | null;
    messenger: boolean;
    messengerReason: string | null;
  }> {
    const result = {
      whatsapp: true,
      whatsappReason: null as string | null,
      email: true,
      emailReason: null as string | null,
      sms: true,
      smsReason: null as string | null,
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
    if (channels.includes("email")) {
      const check = await this.emailCapability.check(companyId);
      result.email = check.available;
      result.emailReason = check.available ? null : `email_unavailable:${check.reason}`;
    }
    if (channels.includes("sms")) {
      const check = await this.smsCapability.check(companyId);
      result.sms = check.available;
      result.smsReason = check.available ? null : `sms_unavailable:${check.reason}`;
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
        variables: campaignTextChannelVariables({
          customerName: input.customer.name,
          content: input.content,
        }),
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

  private async processEmailRecipient(input: {
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
      channel: "email",
      byKey: input.byKey,
    });
    if (!recipient) return;

    if (!input.channelAvailable) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        error_message: input.unavailableReason ?? "email_unavailable",
      });
      return;
    }

    const outbound = resolveCampaignOutboundEmail(input.customer);
    if (!outbound.ok) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        notification_queue_id: null,
        error_message:
          outbound.reason === "missing_email"
            ? "Customer has no eligible email destination"
            : "invalid_email",
      });
      return;
    }

    let sendResult: CommunicationSendResult | null = null;
    try {
      sendResult = await input.dispatcher.send({
        companyId: input.ctx.companyId,
        templateKey: "marketing_campaign",
        channels: ["email"],
        recipient: {
          customerId: input.customer.id,
          name: input.customer.name,
          phone: input.customer.phone,
          email: outbound.email,
        },
        variables: campaignEmailChannelVariables({
          customerName: input.customer.name,
          content: input.content,
          companyId: input.ctx.companyId,
        }),
        idempotencyKey: `campaign:${input.campaign.id}:customer:${input.customer.id}:email`,
        metadata: {
          source: "marketing_campaign",
          campaignId: input.campaign.id,
          campaignRecipientId: recipient.id,
          channel: "email",
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

    const outcome = mapDispatcherResultToRecipientOutcome(outbound.email, sendResult, "email");
    await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
      status: outcome.status,
      notification_queue_id: outcome.notification_queue_id,
      error_message: outcome.error_message,
    });
  }

  private async processSmsRecipient(input: {
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
      channel: "sms",
      byKey: input.byKey,
    });
    if (!recipient) return;

    if (!input.channelAvailable) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        error_message: input.unavailableReason ?? "sms_unavailable",
      });
      return;
    }

    const outbound = resolveCampaignOutboundSms({
      phone: input.customer.phone,
      phoneE164: input.customer.phoneE164,
    });
    if (!outbound.ok) {
      await this.repo.updateRecipient(recipient.id, input.ctx.companyId, {
        status: "skipped",
        notification_queue_id: null,
        error_message:
          outbound.reason === "missing_phone"
            ? "Customer has no eligible SMS destination"
            : "phone_identity_unresolved",
      });
      return;
    }

    let sendResult: CommunicationSendResult | null = null;
    try {
      sendResult = await input.dispatcher.send({
        companyId: input.ctx.companyId,
        templateKey: "marketing_campaign",
        channels: ["sms"],
        recipient: {
          customerId: input.customer.id,
          name: input.customer.name,
          phone: outbound.phone,
          email: input.customer.email,
        },
        variables: campaignTextChannelVariables({
          customerName: input.customer.name,
          content: input.content,
        }),
        idempotencyKey: `campaign:${input.campaign.id}:customer:${input.customer.id}:sms`,
        metadata: {
          source: "marketing_campaign",
          campaignId: input.campaign.id,
          campaignRecipientId: recipient.id,
          channel: "sms",
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

    const outcome = mapDispatcherResultToRecipientOutcome(outbound.phone, sendResult, "sms");
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
