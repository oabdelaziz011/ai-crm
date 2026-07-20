import { ProviderConfigurationResolver } from "../config/provider-config-resolver.js";
import type { AIProviderFactory } from "../factory/ai-provider-factory.js";
import { CostTracker } from "../metrics/cost-tracker.js";
import { HealthMonitor } from "../metrics/health-monitor.js";
import { UsageTracker } from "../metrics/usage-tracker.js";
import type {
  GatewayChatRequest,
  GatewayEmbeddingRequest,
  GatewayRequestContext,
} from "../models/request-response.js";
import {
  createEnterpriseAIProviderRegistry,
  type EnterpriseAIProviderRegistry,
} from "../providers/enterprise-provider-contract.js";
import {
  defaultCapabilitiesForProvider,
  wrapLegacyProviderAsEnterprise,
} from "../providers/enterprise-provider-bridge.js";
import { createMockEnterpriseProvider } from "../providers/mock-provider.js";
import { ExponentialProviderRetryPolicy, executeProviderWithRetry } from "../retry/provider-retry-policy.js";
import type { AIStreamEvent } from "../streaming/stream-events.js";

export type AIGatewayServices = {
  gateway: AIGatewayService;
  cost: CostTracker;
  usage: UsageTracker;
  health: HealthMonitor;
  config: ProviderConfigurationResolver;
};

export class AIGatewayService {
  constructor(
    private readonly deps: {
      factory: AIProviderFactory;
      registry: EnterpriseAIProviderRegistry;
      config: ProviderConfigurationResolver;
      cost: CostTracker;
      usage: UsageTracker;
      health: HealthMonitor;
      retryPolicy?: ExponentialProviderRetryPolicy;
    },
  ) {}

  private async resolveProvider(providerKey: string, configuration: Record<string, unknown>) {
    if (providerKey === "mock") {
      return this.deps.registry.create("mock", configuration);
    }
    if (this.deps.registry.has(providerKey)) {
      return this.deps.registry.create(providerKey, configuration);
    }
    const legacy = await this.deps.factory.resolve({ providerKey, configuration });
    return wrapLegacyProviderAsEnterprise(legacy, defaultCapabilitiesForProvider(providerKey));
  }

  async chatCompletion(input: GatewayChatRequest) {
    const resolved = this.deps.config.resolve({
      companyId: input.context.companyId,
      providerKey: input.providerKey,
      connectionConfiguration: input.metadata,
    });
    const provider = await this.resolveProvider(resolved.providerKey, resolved.configuration);
    const retryPolicy = this.deps.retryPolicy ?? new ExponentialProviderRetryPolicy();

    const started = Date.now();
    try {
      const response = await executeProviderWithRetry(() => provider.chatCompletion(input), retryPolicy);
      const latencyMs = Date.now() - started;
      const cost = this.deps.cost.record({
        providerKey: response.providerKey,
        model: response.model,
        usage: response.usage,
        latencyMs,
      });
      this.deps.usage.record({
        operation: "chat_completion",
        providerKey: response.providerKey,
        model: response.model,
        context: input.context,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCostUsd: cost.estimatedCostUsd,
        latencyMs,
      });
      this.deps.health.recordAttempt(response.providerKey, true, latencyMs);
      return { ...response, estimatedCostUsd: cost.estimatedCostUsd, latencyMs };
    } catch (error) {
      this.deps.health.recordAttempt(
        resolved.providerKey,
        false,
        Date.now() - started,
        error instanceof Error ? error.message : "Unknown provider error",
      );
      throw error;
    }
  }

  async *streamChatCompletion(input: GatewayChatRequest): AsyncIterable<AIStreamEvent> {
    const resolved = this.deps.config.resolve({
      companyId: input.context.companyId,
      providerKey: input.providerKey,
      connectionConfiguration: input.metadata,
    });
    const provider = await this.resolveProvider(resolved.providerKey, resolved.configuration);
    const started = Date.now();
    let outputTokens = 0;
    try {
      for await (const event of provider.streamChatCompletion(input)) {
        if (event.delta) outputTokens += event.delta.length;
        yield event;
      }
      const latencyMs = Date.now() - started;
      const usage = { inputTokens: 10, outputTokens, totalTokens: 10 + outputTokens };
      const cost = this.deps.cost.record({
        providerKey: provider.key,
        model: input.model ?? "unknown",
        usage,
        latencyMs,
      });
      this.deps.usage.record({
        operation: "stream_chat",
        providerKey: provider.key,
        model: input.model ?? "unknown",
        context: input.context,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: cost.estimatedCostUsd,
        latencyMs,
      });
      this.deps.health.recordAttempt(provider.key, true, latencyMs);
    } catch (error) {
      this.deps.health.recordAttempt(
        provider.key,
        false,
        Date.now() - started,
        error instanceof Error ? error.message : "Unknown provider error",
      );
      throw error;
    }
  }

  async createEmbeddings(input: GatewayEmbeddingRequest) {
    const resolved = this.deps.config.resolve({
      companyId: input.context.companyId,
      providerKey: input.providerKey,
      connectionConfiguration: input.metadata,
    });
    const provider = await this.resolveProvider(resolved.providerKey, resolved.configuration);
    const started = Date.now();
    const response = await provider.createEmbeddings(input);
    const latencyMs = Date.now() - started;
    const cost = this.deps.cost.record({
      providerKey: response.providerKey,
      model: response.model,
      usage: response.usage,
      latencyMs,
    });
    this.deps.usage.record({
      operation: "embeddings",
      providerKey: response.providerKey,
      model: response.model,
      context: input.context,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      estimatedCostUsd: cost.estimatedCostUsd,
      latencyMs,
    });
    this.deps.health.recordAttempt(response.providerKey, true, latencyMs);
    return { ...response, estimatedCostUsd: cost.estimatedCostUsd };
  }

  async discoverCapabilities(providerKey: string, configuration: Record<string, unknown> = {}) {
    const provider = await this.resolveProvider(providerKey, configuration);
    return provider.discoverCapabilities();
  }

  async healthCheck(providerKey: string, configuration: Record<string, unknown> = {}) {
    const provider = await this.resolveProvider(providerKey, configuration);
    return provider.healthCheck();
  }

  listSupportedProviders(): string[] {
    const legacy = this.deps.factory.getSupportedProviderKeys();
    const enterprise = this.deps.registry.keys();
    return [...new Set([...legacy, ...enterprise])].sort();
  }
}

export function createAIGatewayServices(factory: AIProviderFactory): AIGatewayServices {
  const cost = new CostTracker();
  const usage = new UsageTracker();
  const health = new HealthMonitor();
  const config = new ProviderConfigurationResolver();
  const registry = createEnterpriseAIProviderRegistry({
    mock: (configuration) => createMockEnterpriseProvider(configuration),
  });
  const gateway = new AIGatewayService({
    factory,
    registry,
    config,
    cost,
    usage,
    health,
  });
  return { gateway, cost, usage, health, config };
}

export function createGatewayContext(companyId: string, patch?: Partial<GatewayRequestContext>): GatewayRequestContext {
  return {
    companyId,
    tenantId: patch?.tenantId,
    workflowId: patch?.workflowId,
    executionId: patch?.executionId,
    conversationId: patch?.conversationId,
    userId: patch?.userId ?? null,
  };
}
