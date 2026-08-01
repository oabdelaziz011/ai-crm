import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDefaultAIProviderFactory,
  createSupabaseAIProviderDefinitionRepository,
} from "@workspace/ai-provider-layer";
import {
  createSupabaseAIExecutionMetricsRepository,
  createSupabaseAIExecutionRepository,
  createSupabasePromptBuildReader,
  createSupabaseProviderConnectionReader,
} from "./repositories/supabase-execution-repositories.js";
import { createDefaultRuntimeRegistries } from "./registries/runtime-registries.js";
import { RuntimeObservability } from "./observability/runtime-observability.js";
import { ExecutionSessionService } from "./runtime/execution-session-service.js";
import { EnterpriseAIRuntimeService } from "./runtime/enterprise-ai-runtime-service.js";
import type { RuntimeGatewayPort, RuntimePromptPort, RuntimeToolPort, PlatformRuntimeConfigPort } from "./ports/runtime-ports.js";
import type { RuntimeKnowledgePort } from "./ports/knowledge-port.js";
import { AIExecutionMetricsService } from "./services/ai-execution-metrics-service.js";
import { AIExecutionPolicyService } from "./services/ai-execution-policy-service.js";
import { AIExecutionService } from "./services/ai-execution-service.js";

export type EnterpriseRuntimeIntegrations = {
  prompt: RuntimePromptPort;
  gateway: RuntimeGatewayPort;
  knowledge?: RuntimeKnowledgePort;
  tools?: RuntimeToolPort;
  platformConfig?: PlatformRuntimeConfigPort;
};

export type AIExecutionServices = {
  execution: AIExecutionService;
  policy: AIExecutionPolicyService;
  metrics: AIExecutionMetricsService;
  enterpriseRuntime?: EnterpriseAIRuntimeService;
  sessions: ExecutionSessionService;
  observability: RuntimeObservability;
  registries: ReturnType<typeof createDefaultRuntimeRegistries>;
};

export function createAIExecutionServices(
  client: SupabaseClient,
  integrations?: EnterpriseRuntimeIntegrations,
): AIExecutionServices {
  const executionRepository = createSupabaseAIExecutionRepository(client);
  const metricsRepository = createSupabaseAIExecutionMetricsRepository(client);
  const promptBuildReader = createSupabasePromptBuildReader(client);
  const connectionReader = createSupabaseProviderConnectionReader(client);
  const providerFactory = createDefaultAIProviderFactory(createSupabaseAIProviderDefinitionRepository(client));
  const policyService = new AIExecutionPolicyService();
  const registries = createDefaultRuntimeRegistries();
  const sessions = new ExecutionSessionService();
  const observability = new RuntimeObservability();

  const services: AIExecutionServices = {
    policy: policyService,
    metrics: new AIExecutionMetricsService(executionRepository, metricsRepository),
    execution: new AIExecutionService(
      executionRepository,
      metricsRepository,
      promptBuildReader,
      connectionReader,
      providerFactory,
      policyService,
    ),
    sessions,
    observability,
    registries,
  };

  if (integrations) {
    services.enterpriseRuntime = new EnterpriseAIRuntimeService({
      prompt: integrations.prompt,
      gateway: integrations.gateway,
      registries,
      executionRepository,
      metricsRepository,
      connectionReader,
      promptBuildReader,
      policyService,
      sessions,
      observability,
      knowledge: integrations.knowledge,
      tools: integrations.tools,
      platformConfig: integrations.platformConfig,
    });
  }

  return services;
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./errors/runtime-errors.js";
export * from "./types.js";
export * from "./utils/execution-utils.js";
export * from "./ports/runtime-ports.js";
export * from "./context/knowledge-context-provider.js";
export * from "./context/context-providers.js";
export * from "./context/context-builder.js";
export * from "./context/conversation-window-manager.js";
export * from "./context/context-policy.js";
export * from "./context/token-budget-manager.js";
export * from "./hooks/runtime-hooks.js";
export * from "./middleware/runtime-middleware.js";
export * from "./cache/runtime-cache.js";
export * from "./observability/runtime-observability.js";
export * from "./registries/runtime-registries.js";
export * from "./runtime/enterprise-ai-runtime-service.js";
export * from "./runtime/execution-session-service.js";
export * from "./runtime/tool-call-loop-service.js";
export * from "./runtime/runtime-tool-denial-factory.js";
export * from "./runtime/streaming-runtime-service.js";
export * from "./repositories/execution-repositories.js";
export * from "./repositories/supabase-execution-repositories.js";
export * from "./services/ai-execution-policy-service.js";
export * from "./services/ai-execution-metrics-service.js";
export * from "./services/ai-execution-service.js";
export type { RuntimeKnowledgePort, RuntimeKnowledgeQueryInput, RuntimeKnowledgeQueryResult } from "./ports/knowledge-port.js";
export {
  createEnterpriseRuntimeIntegrations,
  createRuntimeGatewayPort,
  createRuntimeKnowledgePort,
  createRuntimePromptPort,
} from "./adapters/enterprise-runtime-adapters.js";
