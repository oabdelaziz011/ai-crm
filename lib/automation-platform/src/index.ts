import type { SupabaseClient } from "@supabase/supabase-js";
import { AutomationEngine } from "./engine/automation-engine.js";
import { createBuiltInAutomationNodeHandlers, type AutomationActionDeps } from "./engine/built-in-nodes.js";
import { AutomationNodeRegistry, createDefaultAutomationNodeRegistry } from "./engine/node-registry.js";
import { createDefaultChannelAdapterRegistry } from "./orchestrator/channel-adapter.js";
import { ConversationOrchestrator } from "./orchestrator/conversation-orchestrator.js";
import { InMemoryCustomerResolver } from "./ports/customer-resolver-port.js";
import {
  beginVariableResolverRegistration,
  freezeVariableResolverRegistry,
} from "./logic/variable-resolver-registry.js";
import { registerLookupVariableResolver } from "./crm/lookup/register-lookup-variable-resolver.js";
import {
  createSupabaseAutomationEdgeRepository,
  createSupabaseAutomationFlowRepository,
  createSupabaseAutomationNodeRepository,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationMessageRepository,
  createSupabaseConversationSessionRepository,
} from "./repositories/supabase-automation-repositories.js";
import { createSupabaseAutomationFlowVersionRepository } from "./lifecycle/supabase-version-repository.js";
import { createSupabaseAutomationFlowVersionGraphRepository } from "./lifecycle/supabase-version-graph-repository.js";
import { createSupabaseWorkflowPublishTransactionRepository } from "./lifecycle/supabase-publish-transaction-repository.js";
import { WorkflowAuditService } from "./lifecycle/audit-service.js";
import { WorkflowLifecycleService } from "./lifecycle/lifecycle-service.js";
import { WorkflowPublishService } from "./lifecycle/publish-service.js";
import { WorkflowRollbackService } from "./lifecycle/rollback-service.js";
import { AutomationFlowService } from "./services/automation-flow-service.js";

beginVariableResolverRegistration();
registerLookupVariableResolver();
freezeVariableResolverRegistry();

export type AutomationPlatformServices = {
  flows: AutomationFlowService;
  lifecycle: WorkflowLifecycleService;
  publish: WorkflowPublishService;
  rollback: WorkflowRollbackService;
  audit: WorkflowAuditService;
  engine: AutomationEngine;
  orchestrator: ConversationOrchestrator;
};

export function createAutomationPlatformServices(
  client: SupabaseClient,
  options?: {
    registry?: ReturnType<typeof createDefaultAutomationNodeRegistry>;
    actionDeps?: AutomationActionDeps;
  },
): AutomationPlatformServices {
  const flowRepository = createSupabaseAutomationFlowRepository(client);
  const nodeRepository = createSupabaseAutomationNodeRepository(client);
  const edgeRepository = createSupabaseAutomationEdgeRepository(client);
  const runRepository = createSupabaseAutomationRunRepository(client);
  const sessionRepository = createSupabaseConversationSessionRepository(client);
  const messageRepository = createSupabaseConversationMessageRepository(client);
  const versionRepository = createSupabaseAutomationFlowVersionRepository(client);
  const versionGraphRepository = createSupabaseAutomationFlowVersionGraphRepository(client);
  const publishTransactionRepository = createSupabaseWorkflowPublishTransactionRepository(client);
  const audit = new WorkflowAuditService();
  const registry =
    options?.registry ??
    new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers(options?.actionDeps));
  const engine = new AutomationEngine({
    flows: flowRepository,
    runs: runRepository,
    sessions: sessionRepository,
    versions: versionRepository,
    versionGraph: versionGraphRepository,
    registry: options?.registry ?? registry,
  });

  return {
    flows: new AutomationFlowService(flowRepository),
    lifecycle: new WorkflowLifecycleService(flowRepository, versionRepository, audit),
    publish: new WorkflowPublishService(flowRepository, publishTransactionRepository, audit),
    rollback: new WorkflowRollbackService(flowRepository, versionRepository, nodeRepository, edgeRepository, audit),
    audit,
    engine,
    orchestrator: new ConversationOrchestrator({
      adapters: createDefaultChannelAdapterRegistry(),
      flows: flowRepository,
      sessions: sessionRepository,
      runs: runRepository,
      messages: messageRepository,
      customers: new InMemoryCustomerResolver(),
      engine,
    }),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./repositories/automation-repositories.js";
export * from "./repositories/supabase-automation-repositories.js";
export * from "./services/automation-flow-service.js";
export * from "./engine/automation-engine.js";
export * from "./engine/execution-context.js";
export * from "./engine/node-registry.js";
export * from "./engine/built-in-nodes.js";
export * from "./engine/flow-graph.js";
export * from "./engine/interactive-routing.js";
export * from "./engine/runtime-store.js";
export * from "./orchestrator/channel-adapter.js";
export * from "./orchestrator/conversation-orchestrator.js";
export * from "./orchestrator/conversation-resolver.js";
export * from "./orchestrator/session-policy.js";
export * from "./orchestrator/inbound-automation-routing.js";
export * from "./debug/list-node-lifecycle-debug.js";
export {
  traceIfNodeEvaluation as traceInteractiveIfNodeEvaluation,
  isInteractiveIfTraceEnabled,
  logInteractiveIfTrace,
  traceBuildResumeInput,
  traceEngineResumeInput,
  traceListSelectionApplied,
  traceParsedInboundMessage,
  type InteractiveIfTraceStage,
  type InteractiveIfTraceLog,
} from "./debug/interactive-if-trace-debug.js";
export * from "./debug/if-node-trace-debug.js";
export * from "./debug/inbound-routing-trace-debug.js";
export * from "./orchestrator/trigger-dispatcher.js";
export * from "./ports/customer-resolver-port.js";
export * from "./transport/models.js";
export * from "./transport/channel-provider.js";
export * from "./transport/provider-registry.js";
export * from "./transport/retry-policy.js";
export * from "./transport/webhook.js";
export * from "./transport/transport-service.js";
export * from "./transport/stub-providers.js";
export * from "./transport/adapter-bridge.js";
export * from "./transport/whatsapp/whatsapp-config.js";
export * from "./transport/whatsapp/whatsapp-types.js";
export * from "./transport/whatsapp/whatsapp-api-client.js";
export * from "./transport/whatsapp/whatsapp-provider.js";
export * from "./transport/whatsapp/whatsapp-webhook-controller.js";
export * from "./logic/index.js";
export * from "./lifecycle/index.js";
export * from "./runtime/conversation-variables.js";
export {
  OUTBOUND_QUEUE_VARIABLE,
  OUTBOUND_LEGACY_VARIABLE,
  readOutboundQueue,
  readLatestOutbound,
  resetOutboundQueue,
  appendOutboundQueueEntry,
  clearLatestOutboundSlot,
  outboundEntryDisplayText,
  type OutboundQueueEntry,
} from "./runtime/outbound-queue.js";
export * from "./runtime/main-menu.js";
export * from "./field-binding/types.js";
export * from "./field-binding/normalize.js";
export * from "./field-binding/validate.js";
export * from "./field-binding/resolver.js";
export * from "./crm/create-booking-config.js";
export * from "./crm/types/create-booking-input.js";
export * from "./crm/booking-repository-port.js";
export * from "./crm/booking-service.js";
export * from "./ports/booking-service-port.js";
export * from "./crm/find-customer-config.js";
export * from "./crm/types/find-customer-input.js";
export * from "./crm/customer/customer-repository-port.js";
export * from "./crm/customer/customer-service.js";
export * from "./crm/lookup/types.js";
export * from "./crm/lookup/build-lookup-state.js";
export * from "./crm/lookup/output-variables.js";
export * from "./crm/lookup/lookup-variable-resolver.js";
export * from "./crm/lookup/register-lookup-variable-resolver.js";
export * from "./crm/types/customer-mutation-input.js";
export * from "./crm/types/find-booking-input.js";
export * from "./crm/types/booking-mutation-input.js";
export * from "./crm/find-booking-config.js";
export * from "./crm/update-booking-config.js";
export * from "./crm/cancel-booking-config.js";
export * from "./crm/lookup/booking-types.js";
export * from "./crm/supabase/supabase-customer-repository.js";
export {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
  type SupabaseCustomerServicePortOptions,
} from "./crm/supabase/create-supabase-customer-service-port.js";
export { createSupabaseConversationCustomerLinkPort } from "./crm/supabase/create-supabase-conversation-customer-link-port.js";
export type { ConversationCustomerLinkPort, LinkConversationCustomerInput } from "./ports/conversation-customer-link-port.js";
export { resolveInboxConversationId } from "./runtime/resolve-inbox-conversation-id.js";
export { SupabaseBookingRepository } from "./crm/supabase/supabase-booking-repository.js";
export {
  createSupabaseBookingServicePort,
  type SupabaseBookingServicePortOptions,
} from "./crm/supabase/create-supabase-booking-service-port.js";
export * from "./ports/customer-service-port.js";
