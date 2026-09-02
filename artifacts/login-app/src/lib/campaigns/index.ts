export type {
  CampaignAudienceCustomer,
  CampaignAudienceDefinition,
  CampaignAudienceFilterDefinition,
  CampaignAudienceResolveResult,
  CampaignChannelCounts,
  CampaignChannelEligibilityPreview,
  CampaignContentDefinition,
  CampaignEligibilityPreviewResult,
  CampaignExecuteResult,
  CreateCampaignDraftInput,
  MarketingCampaignAudienceType,
  MarketingCampaignChannel,
  MarketingCampaignRecipientRecord,
  MarketingCampaignRecipientStatus,
  MarketingCampaignRecord,
  MarketingCampaignStatus,
} from "./types";
export {
  MARKETING_CAMPAIGN_AUDIENCE_TYPES,
  MARKETING_CAMPAIGN_CHANNELS,
  MARKETING_CAMPAIGN_RECIPIENT_STATUSES,
  MARKETING_CAMPAIGN_STATUSES,
  META_MESSAGING_RESPONSE_WINDOW_MS,
  MarketingCampaignError,
  isMarketingCampaignChannel,
  normalizeCampaignChannels,
} from "./types";
export { CampaignAudienceResolver } from "./audience-resolver";
export { MarketingCampaignRepository } from "./repository";
export {
  CAMPAIGNS_FEATURE_CODE,
  MarketingCampaignService,
  mapDispatcherResultToRecipientOutcome,
  type CampaignDispatcherFactory,
  type MarketingCampaignServiceOptions,
} from "./campaign-execution-service";
export {
  WhatsAppCampaignCapabilityChecker,
  type WhatsAppCampaignCapabilityResult,
} from "./whatsapp-capability";
export {
  MetaMessagingCampaignCapabilityChecker,
  type CampaignFeatureEntitlementPort,
  type MetaMessagingCapabilityResult,
} from "./meta-messaging-capability";
export {
  CampaignThreadEligibilityResolver,
  isWithinMessagingResponseWindow,
  renderMetaMessagingCampaignText,
  type CampaignThreadBinding,
  type MetaMessagingChannelKey,
  type ThreadEligibilityResult,
} from "./thread-eligibility";
export {
  mapChannelOutboundToRecipientOutcome,
  META_MESSAGING_CAMPAIGN_BATCH_PAUSE_MS,
  META_MESSAGING_CAMPAIGN_BATCH_SIZE,
  runInBatches,
  type CampaignChannelOutboundPort,
  type CampaignChannelOutboundRequest,
  type CampaignChannelOutboundResult,
} from "./channel-outbound-port";
export { createChannelPlatformCampaignOutboundPort } from "./channel-outbound-adapter";
export {
  CAMPAIGN_CREATE_IDEMPOTENCY_STORAGE_PREFIX,
  campaignCreateIdempotencyStorageKey,
  clearCampaignSubmissionIdempotencyKey,
  createCampaignIdempotencyKey,
  getOrCreateCampaignSubmissionIdempotencyKey,
} from "./campaign-submission-idempotency";
export {
  assertCustomerScopedCampaignQuery,
  buildCustomerCampaignHistorySummary,
  buildCustomerCampaignTimeline,
  customerCampaignHistoryItemMatchesStatusFilter,
  customerCampaignHistoryUsesPhoneMatching,
  CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE,
  mergeCustomerCampaignDeliveryEnrichment,
  parseCampaignContentFields,
  resolveCustomerCampaignDisplayStatus,
  resolveCustomerCampaignHistoryDateRange,
} from "./customer-campaign-history";
export type {
  CustomerCampaignDeliveryEnrichment,
  CustomerCampaignHistoryItem,
  CustomerCampaignHistoryPeriod,
  CustomerCampaignHistoryQuery,
  CustomerCampaignHistoryResult,
  CustomerCampaignHistoryStatusFilter,
  CustomerCampaignHistorySummary,
  CustomerCampaignTimelineEvent,
} from "./customer-campaign-history";
export {
  applyCampaignLifecyclePatch,
  computeCampaignDeliveryStatusPatch,
  computeCampaignReplyPatch,
  computeCampaignSendSuccessPatch,
  currentLifecycleRank,
  normalizeProviderMessageId,
} from "./campaign-delivery-reconciliation";
export type {
  CampaignDeliveryWebhookStatus,
  CampaignRecipientLifecyclePatch,
  CampaignRecipientLifecycleSnapshot,
} from "./campaign-delivery-reconciliation";
export {
  createCampaignDeliveryReconcilePort,
  reconcileCampaignRecipientDeliveryStatus,
  reconcileCampaignRecipientQuotedReply,
  reconcileCampaignRecipientSendSuccess,
} from "./reconcile-campaign-recipient-delivery";
