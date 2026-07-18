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
import { AIExecutionMetricsService } from "./services/ai-execution-metrics-service.js";
import { AIExecutionPolicyService } from "./services/ai-execution-policy-service.js";
import { AIExecutionService } from "./services/ai-execution-service.js";

export type AIExecutionServices = {
  execution: AIExecutionService;
  policy: AIExecutionPolicyService;
  metrics: AIExecutionMetricsService;
};

export function createAIExecutionServices(client: SupabaseClient): AIExecutionServices {
  const executionRepository = createSupabaseAIExecutionRepository(client);
  const metricsRepository = createSupabaseAIExecutionMetricsRepository(client);
  const promptBuildReader = createSupabasePromptBuildReader(client);
  const connectionReader = createSupabaseProviderConnectionReader(client);
  const providerFactory = createDefaultAIProviderFactory(createSupabaseAIProviderDefinitionRepository(client));
  const policyService = new AIExecutionPolicyService();

  return {
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
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/execution-utils.js";
export * from "./repositories/execution-repositories.js";
export * from "./repositories/supabase-execution-repositories.js";
export * from "./services/ai-execution-policy-service.js";
export * from "./services/ai-execution-metrics-service.js";
export * from "./services/ai-execution-service.js";
