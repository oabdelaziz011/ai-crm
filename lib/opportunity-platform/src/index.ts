import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOpportunityRepository } from "./repositories/supabase-opportunity-repositories.js";
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
    commands: new OpportunityCommandService({ opportunities, events }),
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
export { OpportunityCommandService } from "./services/opportunity-command-service.js";
export { OpportunityQueryService } from "./services/opportunity-query-service.js";
export type { OpportunityEventPublisherPort } from "./services/opportunity-command-service.js";
