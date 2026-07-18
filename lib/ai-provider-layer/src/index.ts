import type { SupabaseClient } from "@supabase/supabase-js";
import { createDefaultAIProviderFactory } from "./factory/ai-provider-factory.js";
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
};

export function createAIProviderServices(client: SupabaseClient): AIProviderServices {
  const definitionRepository = createSupabaseAIProviderDefinitionRepository(client);
  const connectionRepository = createSupabaseAIProviderConnectionRepository(client);
  const factory = createDefaultAIProviderFactory(definitionRepository);

  return {
    registry: new AIProviderRegistryService(definitionRepository, connectionRepository, factory),
    factory,
    health: new AIProviderHealthService(connectionRepository, factory),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./providers/provider-contract.js";
export * from "./providers/stub-adapters.js";
export * from "./providers/stub-adapter-base.js";
export * from "./providers/openai-chat-adapter.js";
export * from "./factory/ai-provider-factory.js";
export * from "./repositories/provider-repositories.js";
export * from "./repositories/supabase-provider-repositories.js";
export * from "./services/ai-provider-registry-service.js";
export * from "./services/ai-provider-health-service.js";
export * from "./utils/validate-configuration.js";
