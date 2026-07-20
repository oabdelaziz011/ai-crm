import type { ProviderCapabilities } from "../capabilities/provider-capabilities.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  TextGenerationRequest,
  TextGenerationResponse,
} from "../models/request-response.js";
import type { AIStreamEvent } from "../streaming/stream-events.js";
import type { ConfigurationValidationResult } from "../types.js";
import type { ProviderHealthSnapshot } from "../metrics/health-monitor.js";

export interface EnterpriseAIProvider {
  readonly key: string;
  chatCompletion(input: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  streamChatCompletion(input: ChatCompletionRequest): AsyncIterable<AIStreamEvent>;
  generateText(input: TextGenerationRequest): Promise<TextGenerationResponse>;
  createEmbeddings(input: EmbeddingRequest): Promise<EmbeddingResponse>;
  healthCheck(): Promise<ProviderHealthSnapshot>;
  discoverCapabilities(): ProviderCapabilities;
  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult;
}

export type EnterpriseAIProviderFactory = (configuration: Record<string, unknown>) => EnterpriseAIProvider;

export type EnterpriseAIProviderRegistry = {
  has(key: string): boolean;
  keys(): string[];
  create(key: string, configuration: Record<string, unknown>): EnterpriseAIProvider;
};

export function createEnterpriseAIProviderRegistry(
  adapters: Record<string, EnterpriseAIProviderFactory>,
): EnterpriseAIProviderRegistry {
  const registry = new Map(Object.entries(adapters));
  return {
    has(key: string) {
      return registry.has(key);
    },
    keys() {
      return [...registry.keys()];
    },
    create(key: string, configuration: Record<string, unknown>) {
      const factory = registry.get(key);
      if (!factory) throw new Error(`Enterprise adapter factory for ${key} is not registered.`);
      return factory(configuration);
    },
  };
}
