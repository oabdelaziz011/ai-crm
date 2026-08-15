import type { SupabaseClient } from "@supabase/supabase-js";
import { TicketCommandService } from "./services/ticket-command-service.js";
import { TicketQueryService } from "./services/ticket-query-service.js";
import type {
  TicketAuditPort,
  TicketEventPublisherPort,
  TicketNotificationPort,
  TicketSlaSettingsPort,
} from "./ports/ticket-platform-ports.js";
import type { TicketReadPort } from "./ports/ticket-read-port.js";
import {
  createSupabaseTicketAssigneeResolver,
  createSupabaseTicketCommentRepository,
  createSupabaseTicketRepository,
  createSupabaseTicketSlaSettingsPort,
} from "./repositories/supabase-ticket-repositories.js";
import {
  createNoopTicketAuditPort,
  createNoopTicketEventPublisher,
  createNoopTicketNotificationPort,
  createSupabaseTicketAuditPort,
} from "./ports/noop-ports.js";
import { InMemoryTicketQueryCache } from "./cache/in-memory-ticket-query-cache.js";
import type { TicketQueryCachePort } from "./cache/ticket-query-cache-port.js";
import { createTicketReadPort } from "./adapters/ticket-query-read-port.js";

export type TicketPlatformServices = {
  commands: TicketCommandService;
  queries: TicketQueryService;
  reads: TicketReadPort;
};

export type CreateTicketPlatformServicesOptions = {
  events?: TicketEventPublisherPort;
  notifications?: TicketNotificationPort;
  audit?: TicketAuditPort;
  cache?: TicketQueryCachePort;
  slaSettings?: TicketSlaSettingsPort;
};

export function createTicketPlatformServices(
  client: SupabaseClient,
  options: CreateTicketPlatformServicesOptions = {},
): TicketPlatformServices {
  const tickets = createSupabaseTicketRepository(client);
  const comments = createSupabaseTicketCommentRepository(client);
  const assignees = createSupabaseTicketAssigneeResolver(client);
  const events = options.events ?? createNoopTicketEventPublisher();
  const notifications = options.notifications ?? createNoopTicketNotificationPort();
  const audit = options.audit ?? createNoopTicketAuditPort();
  const cache = options.cache ?? new InMemoryTicketQueryCache();
  const slaSettings = options.slaSettings ?? createSupabaseTicketSlaSettingsPort(client);

  const commandDeps = {
    tickets,
    comments,
    assignees,
    events,
    notifications,
    audit,
    slaSettings,
    cache,
  };

  const commands = new TicketCommandService(commandDeps);
  const queries = new TicketQueryService({ tickets, comments, cache });
  const reads = createTicketReadPort(queries);

  return { commands, queries, reads };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types/index.js";
export * from "./events/index.js";
export * from "./ports/index.js";
export * from "./ports/ticket-read-port.js";
export * from "./cache/ticket-query-cache-port.js";
export { InMemoryTicketQueryCache } from "./cache/in-memory-ticket-query-cache.js";
export * from "./commands/index.js";
export * from "./queries/index.js";
export { createTicketReadPort } from "./adapters/ticket-query-read-port.js";
export { TicketCommandService } from "./services/ticket-command-service.js";
export { TicketQueryService } from "./services/ticket-query-service.js";
export {
  computeSlaDueAt,
  isSlaBreached,
  isSlaWarning,
  computeResolutionMinutes,
  computeResponseMinutes,
  computeSlaCompliancePercent,
  defaultSlaHoursByPriority,
  resolveSlaHoursByPriority,
  resolveSlaWarningHours,
  DEFAULT_SLA_WARNING_HOURS,
} from "./services/ticket-sla-service.js";
export type {
  TicketSlaHoursByPriority,
  TicketSlaSettings,
} from "./services/ticket-sla-service.js";
export {
  createNoopTicketAuditPort,
  createNoopTicketEventPublisher,
  createNoopTicketNotificationPort,
  createNoopTicketSlaSettingsPort,
  createSupabaseTicketAuditPort,
} from "./ports/noop-ports.js";
export { createSupabaseTicketSlaSettingsPort } from "./repositories/supabase-ticket-repositories.js";
