import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOpportunityRepository } from "./repositories/supabase-opportunity-repositories.js";
import { createSupabaseOpportunitySaleCompletion } from "./repositories/supabase-sale-completion.js";
import {
  OpportunityCommandService,
  type OpportunityEventPublisherPort,
} from "./services/opportunity-command-service.js";
import { OpportunityQueryService } from "./services/opportunity-query-service.js";

export type OpportunityPlatformServices = {
  commands: OpportunityCommandService;
  queries: OpportunityQueryService;
};

export function createNoopOpportunityEventPublisher(): OpportunityEventPublisherPort {
  return {
    async publishCreated() {},
    async publishStageChanged() {},
    async publishProbabilityChanged() {},
    async publishWon() {},
    async publishLost() {},
    async publishNegotiationStarted() {},
  };
}

export function createOpportunityPlatformServices(
  client: SupabaseClient,
  options: { events?: OpportunityEventPublisherPort } = {},
): OpportunityPlatformServices {
  const opportunities = createSupabaseOpportunityRepository(client);
  const events = options.events ?? createNoopOpportunityEventPublisher();
  return {
    commands: new OpportunityCommandService({
      opportunities,
      events,
      saleCompletion: createSupabaseOpportunitySaleCompletion(client),
    }),
    queries: new OpportunityQueryService({ opportunities }),
  };
}

export * from "./currency-utils.js";
export * from "./opportunity-name-utils.js";
export * from "./opportunity-audit-utils.js";
export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export type { OpportunityRepository } from "./repositories/opportunity-repository-port.js";
export { createSupabaseOpportunityRepository } from "./repositories/supabase-opportunity-repositories.js";
export { createSupabaseOpportunitySaleCompletion } from "./repositories/supabase-sale-completion.js";
export { OpportunityCommandService } from "./services/opportunity-command-service.js";
export {
  decideProductInterestOpportunity,
  decideFromCatalogRecommendation,
  type ProductInterestOpportunityDecision,
  type ProductInterestOpportunityInput,
} from "./services/opportunity-product-interest.js";
export { applyStoredProductInterestAfterQualify } from "./services/apply-product-interest-after-qualify.js";
export { recordVerifiedProductInterestForConversation } from "./services/record-verified-product-interest.js";
export { isDemoLedLead, isDemoLedLifecycle } from "./services/demo-led-lead.js";
export {
  isDemoScheduledLifecycle,
  isOpportunityVisibleInModule,
  OPPORTUNITY_VISIBLE_LEAD_LIFECYCLES,
} from "./services/demo-opportunity-visibility.js";
export {
  LEAD_LIFECYCLE_TO_OPPORTUNITY_STAGE_KEY,
  mapLeadLifecycleToOpportunityStageKey,
  syncOpportunityStageFromLeadLifecycle,
  type LeadOpportunityStageSyncResult,
} from "./services/lead-opportunity-stage-sync.js";
export {
  assertOpportunityStageTransition,
  isOpportunityStageTransitionAllowed,
} from "./validators/opportunity-stage-transition.js";
export { OpportunityQueryService } from "./services/opportunity-query-service.js";
export type { OpportunityEventPublisherPort } from "./services/opportunity-command-service.js";
