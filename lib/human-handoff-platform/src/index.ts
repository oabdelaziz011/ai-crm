import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryHandoffQueryCache } from "./cache/in-memory-handoff-query-cache.js";
import type { HandoffQueryCachePort } from "./cache/handoff-query-cache-port.js";
import { createHandoffReadPort } from "./adapters/handoff-query-read-port.js";
import type { HandoffReadPort } from "./ports/handoff-read-port.js";
import type {
  HandoffAgentResolverPort,
  HandoffAuditPort,
  HandoffContextAssemblyPort,
  HandoffConversationPort,
  HandoffEventPublisherPort,
  HandoffNotificationPort,
} from "./ports/handoff-platform-ports.js";
import {
  createNoopHandoffAgentResolverPort,
  createNoopHandoffAuditPort,
  createNoopHandoffContextAssemblyPort,
  createNoopHandoffConversationPort,
  createNoopHandoffEventPublisher,
  createNoopHandoffNotificationPort,
} from "./ports/noop-ports.js";
import { createSupabaseHandoffRepository } from "./repositories/supabase-handoff-repositories.js";
import { HandoffCommandService } from "./services/handoff-command-service.js";
import { HandoffQueryService } from "./services/handoff-query-service.js";

export type HandoffPlatformServices = {
  commands: HandoffCommandService;
  queries: HandoffQueryService;
  reads: HandoffReadPort;
};

export type CreateHandoffPlatformServicesOptions = {
  conversations?: HandoffConversationPort;
  context?: HandoffContextAssemblyPort;
  agents?: HandoffAgentResolverPort;
  events?: HandoffEventPublisherPort;
  notifications?: HandoffNotificationPort;
  audit?: HandoffAuditPort;
  cache?: HandoffQueryCachePort;
};

export function createHandoffPlatformServices(
  client: SupabaseClient,
  options: CreateHandoffPlatformServicesOptions = {},
): HandoffPlatformServices {
  const handoff = createSupabaseHandoffRepository(client);
  const conversations = options.conversations ?? createNoopHandoffConversationPort();
  const context = options.context ?? createNoopHandoffContextAssemblyPort();
  const agents = options.agents ?? createNoopHandoffAgentResolverPort();
  const events = options.events ?? createNoopHandoffEventPublisher();
  const notifications = options.notifications ?? createNoopHandoffNotificationPort();
  const audit = options.audit ?? createNoopHandoffAuditPort();
  const cache = options.cache ?? new InMemoryHandoffQueryCache();

  const commands = new HandoffCommandService({
    handoff,
    conversations,
    context,
    agents,
    events,
    notifications,
    audit,
  });

  const queries = new HandoffQueryService({ handoff, cache });
  const reads = createHandoffReadPort(queries);

  return { commands, queries, reads };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types/index.js";
export * from "./events/index.js";
export * from "./ports/index.js";
export * from "./ports/handoff-read-port.js";
export * from "./cache/handoff-query-cache-port.js";
export { InMemoryHandoffQueryCache } from "./cache/in-memory-handoff-query-cache.js";
export { createHandoffReadPort } from "./adapters/handoff-query-read-port.js";
export { HandoffCommandService } from "./services/handoff-command-service.js";
export { HandoffQueryService } from "./services/handoff-query-service.js";
export { selectQueueAgent, estimateWaitTimeSeconds } from "./services/queue-routing-engine.js";
export { resolveEscalationRule } from "./services/escalation-engine.js";
export {
  createNoopHandoffAgentResolverPort,
  createNoopHandoffAuditPort,
  createNoopHandoffContextAssemblyPort,
  createNoopHandoffConversationPort,
  createNoopHandoffEventPublisher,
  createNoopHandoffNotificationPort,
  createSupabaseHandoffAuditPort,
} from "./ports/noop-ports.js";
