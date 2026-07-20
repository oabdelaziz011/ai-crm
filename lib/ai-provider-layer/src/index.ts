import type { SupabaseClient } from "@supabase/supabase-js";
import { createDefaultAIProviderFactory } from "./factory/ai-provider-factory.js";
import { createAIGatewayServices } from "./gateway/ai-gateway-service.js";
import {
  createSupabaseAIProviderConnectionRepository,
  createSupabaseAIProviderDefinitionRepository,
} from "./repositories/supabase-provider-repositories.js";
import { AIProviderHealthService } from "./services/ai-provider-health-service.js";
import { AIProviderRegistryService } from "./services/ai-provider-registry-service.js";

export type AIProviderServices = {
  registry: AIProviderRegistryService;
  factory: ReturnType<typeof createDefaultAIProviderFactory>;
  health: AIProviderHealthService;
  gateway: ReturnType<typeof createAIGatewayServices>["gateway"];
  cost: ReturnType<typeof createAIGatewayServices>["cost"];
  usage: ReturnType<typeof createAIGatewayServices>["usage"];
  healthMonitor: ReturnType<typeof createAIGatewayServices>["health"];
  config: ReturnType<typeof createAIGatewayServices>["config"];
};

export function createAIProviderServices(client: SupabaseClient): AIProviderServices {
  const definitionRepository = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepository = createSupabaseAIProviderConnectionRepository(client);
  const factory = createDefaultAIProviderFactory(definitionRepository);
  const gatewayBundle = createAIGatewayServices(factory);

  return {
    registry: new AIProviderRegistryService(definitionRepository, connectionRepository, factory),
    factory,
    health: new AIProviderHealthService(connectionRepository, factory),
    gateway: gatewayBundle.gateway,
    cost: gatewayBundle.cost,
    usage: gatewayBundle.usage,
    healthMonitor: gatewayBundle.health,
    config: gatewayBundle.config,
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./models/request-response.js";
export * from "./capabilities/provider-capabilities.js";
export * from "./streaming/stream-events.js";
export * from "./retry/provider-retry-policy.js";
export * from "./metrics/cost-tracker.js";
export * from "./metrics/usage-tracker.js";
export * from "./metrics/health-monitor.js";
export * from "./config/provider-config-resolver.js";
export * from "./gateway/ai-gateway-service.js";
export * from "./providers/provider-contract.js";
export * from "./providers/enterprise-provider-contract.js";
export * from "./providers/enterprise-provider-bridge.js";
export * from "./providers/stub-adapters.js";
export * from "./providers/stub-adapter-base.js";
export * from "./providers/openai-chat-adapter.js";
export * from "./providers/mock-provider.js";
export * from "./factory/ai-provider-factory.js";
export * from "./repositories/provider-repositories.js";
export * from "./repositories/supabase-provider-repositories.js";
export * from "./services/ai-provider-registry-service.js";
export * from "./services/ai-provider-health-service.js";
export * from "./utils/validate-configuration.js";
