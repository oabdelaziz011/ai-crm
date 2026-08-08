import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseQuoteRepository } from "./repositories/supabase-quote-repositories.js";
import {
  QuoteCommandService,
  type QuoteEventPublisherPort,
} from "./services/quote-command-service.js";
import { QuoteQueryService } from "./services/quote-query-service.js";

export type QuotePlatformServices = {
  commands: QuoteCommandService;
  queries: QuoteQueryService;
};

export function createNoopQuoteEventPublisher(): QuoteEventPublisherPort {
  return {
    async publishCreated() {},
    async publishUpdated() {},
    async publishSent() {},
    async publishViewed() {},
    async publishAccepted() {},
    async publishRejected() {},
    async publishExpired() {},
    async publishVersionCreated() {},
    async publishOpportunityQuoteCreated() {},
  };
}

export function createQuotePlatformServices(
  client: SupabaseClient,
  options: { events?: QuoteEventPublisherPort } = {},
): QuotePlatformServices {
  const quotes = createSupabaseQuoteRepository(client);
  const events = options.events ?? createNoopQuoteEventPublisher();
  return {
    commands: new QuoteCommandService({ quotes, events }),
    queries: new QuoteQueryService({ quotes }),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export type { QuoteRepository } from "./repositories/quote-repository-port.js";
export { createSupabaseQuoteRepository } from "./repositories/supabase-quote-repositories.js";
export { QuoteCommandService } from "./services/quote-command-service.js";
export { QuoteQueryService } from "./services/quote-query-service.js";
export type { QuoteEventPublisherPort } from "./services/quote-command-service.js";
