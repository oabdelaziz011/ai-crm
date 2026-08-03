import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryLeadQueryCache } from "./cache/in-memory-lead-query-cache.js";
import type { LeadQueryCachePort } from "./cache/lead-query-cache-port.js";
import { createLeadReadPort } from "./adapters/lead-query-read-port.js";
import type { LeadReadPort } from "./ports/lead-read-port.js";
import type {
  LeadAssigneeResolverPort,
  LeadAuditPort,
  LeadConversionPort,
  LeadEventPublisherPort,
  LeadNotificationPort,
} from "./ports/lead-platform-ports.js";
import {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadEventPublisher,
  createNoopLeadNotificationPort,
} from "./ports/noop-ports.js";
import { createSupabaseLeadRepository } from "./repositories/supabase-lead-repositories.js";
import { LeadCommandService } from "./services/lead-command-service.js";
import { LeadQueryService } from "./services/lead-query-service.js";

export type LeadPlatformServices = {
  commands: LeadCommandService;
  queries: LeadQueryService;
  reads: LeadReadPort;
};

export type CreateLeadPlatformServicesOptions = {
  assignees?: LeadAssigneeResolverPort;
  conversion?: LeadConversionPort;
  events?: LeadEventPublisherPort;
  notifications?: LeadNotificationPort;
  audit?: LeadAuditPort;
  cache?: LeadQueryCachePort;
};

export function createLeadPlatformServices(
  client: SupabaseClient,
  options: CreateLeadPlatformServicesOptions = {},
): LeadPlatformServices {
  const leads = createSupabaseLeadRepository(client);
  const assignees = options.assignees ?? createNoopLeadAssigneeResolverPort();
  const conversion = options.conversion ?? createNoopLeadConversionPort();
  const events = options.events ?? createNoopLeadEventPublisher();
  const notifications = options.notifications ?? createNoopLeadNotificationPort();
  const audit = options.audit ?? createNoopLeadAuditPort();
  const cache = options.cache ?? new InMemoryLeadQueryCache();

  const commands = new LeadCommandService({ leads, assignees, conversion, events, notifications, audit });
  const queries = new LeadQueryService({ leads, cache });
  const reads = createLeadReadPort(queries);

  return { commands, queries, reads };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types/index.js";
export * from "./events/index.js";
export * from "./ports/index.js";
export * from "./ports/lead-read-port.js";
export * from "./cache/lead-query-cache-port.js";
export { InMemoryLeadQueryCache } from "./cache/in-memory-lead-query-cache.js";
export { createLeadReadPort } from "./adapters/lead-query-read-port.js";
export { LeadCommandService } from "./services/lead-command-service.js";
export { LeadQueryService } from "./services/lead-query-service.js";
export {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadEventPublisher,
  createNoopLeadNotificationPort,
  createSupabaseLeadAuditPort,
} from "./ports/noop-ports.js";
