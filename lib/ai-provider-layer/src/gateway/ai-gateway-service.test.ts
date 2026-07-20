import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderConfigurationResolver } from "../config/provider-config-resolver.js";
import { AIProviderFactory } from "../factory/ai-provider-factory.js";
import {
  AIGatewayService,
  createAIGatewayServices,
  createGatewayContext,
} from "../gateway/ai-gateway-service.js";
import { CostTracker } from "../metrics/cost-tracker.js";
import { HealthMonitor } from "../metrics/health-monitor.js";
import { UsageTracker } from "../metrics/usage-tracker.js";
import type { AIProviderDefinitionRepository } from "../repositories/provider-repositories.js";
import { createMockEnterpriseProvider } from "../providers/mock-provider.js";
import { createEnterpriseAIProviderRegistry } from "../providers/enterprise-provider-contract.js";
import { ExponentialProviderRetryPolicy, executeProviderWithRetry } from "../retry/provider-retry-policy.js";
import type { AIProviderDefinitionRecord } from "../types.js";

const mockDefinition: AIProviderDefinitionRecord = {
  id: "provider-mock",
  key: "mock",
  display_name: "Mock Provider",
  description: "Deterministic mock provider",
  icon: "mock",
  supports_generate: true,
  supports_classify: true,
  supports_embed: true,
  supports_streaming: true,
  configuration_schema: { type: "object", properties: { model: { type: "string" } }, required: ["model"] },
  default_configuration: { model: "mock-gpt" },
  is_active: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createDefinitionRepository(): AIProviderDefinitionRepository {
  return {
    listActive: async () => [mockDefinition],
    listAll: async () => [mockDefinition],
    findById: async (id) => (id === mockDefinition.id ? mockDefinition : null),
    findByKey: async (key) => (key === "mock" ? mockDefinition : null),
  };
}

describe("AI Gateway", () => {
  it("resolves mock provider through configuration", async () => {
    const factory = new AIProviderFactory(createDefinitionRepository());
    const services = createAIGatewayServices(factory);
    const context = createGatewayContext("company-1", { workflowId: "flow-1", conversationId: "conv-1" });

    const response = await services.gateway.chatCompletion({
      providerKey: "mock",
      context,
      messages: [{ role: "user", content: "What is VaultOS?" }],
      model: "mock-gpt",
    });

    assert.match(response.text, /mock/i);
    assert.equal(response.providerKey, "mock");
    assert.equal(services.usage.listByCompany("company-1").length, 1);
    assert.equal(services.cost.list().length, 1);
    assert.equal(services.health.list()[0]?.available, true);
  });

  it("streams provider-independent events", async () => {
    const factory = new AIProviderFactory(createDefinitionRepository());
    const services = createAIGatewayServices(factory);
    const events = [];
    for await (const event of services.gateway.streamChatCompletion({
      providerKey: "mock",
      context: createGatewayContext("company-1"),
      messages: [{ role: "user", content: "stream please" }],
    })) {
      events.push(event.type);
    }
    assert.deepEqual(events, ["start", "delta", "delta", "delta", "done"]);
  });

  it("tracks usage per workflow and conversation", async () => {
    const factory = new AIProviderFactory(createDefinitionRepository());
    const services = createAIGatewayServices(factory);
    await services.gateway.chatCompletion({
      providerKey: "mock",
      context: createGatewayContext("company-1", { workflowId: "wf-1", conversationId: "c-1" }),
      messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(services.usage.listByWorkflow("wf-1").length, 1);
  });

  it("discovers provider capabilities", async () => {
    const provider = createMockEnterpriseProvider({ model: "mock-gpt" });
    const capabilities = provider.discoverCapabilities();
    assert.equal(capabilities.supportsChat, true);
    assert.equal(capabilities.supportsStreaming, true);
    assert.equal(capabilities.supportsEmbeddings, true);
  });

  it("retries transient provider failures", async () => {
    let attempts = 0;
    await assert.rejects(
      () =>
        executeProviderWithRetry(async () => {
          attempts += 1;
          throw new Error("temporary");
        }, new ExponentialProviderRetryPolicy({ maxAttempts: 3, baseDelayMs: 1 })),
      /temporary/,
    );
    assert.equal(attempts, 3);
  });

  it("resolves tenant default provider and model from configuration", () => {
    const resolver = new ProviderConfigurationResolver();
    const resolved = resolver.resolve({
      companyId: "company-1",
      tenantConfig: {
        defaultProviderKey: "openai",
        defaultModel: "gpt-4o-mini",
        providerPriority: ["openai", "mock"],
        connections: { openai: { apiKey: "test-key" } },
      },
    });
    assert.equal(resolved.providerKey, "openai");
    assert.equal(resolved.configuration.model, "gpt-4o-mini");
  });

  it("records health failures gracefully", async () => {
    const health = new HealthMonitor();
    const snapshot = health.recordAttempt("mock", false, 12, "timeout");
    assert.equal(snapshot.available, false);
    assert.equal(snapshot.lastError, "timeout");
  });

  it("creates embeddings through the gateway", async () => {
    const factory = new AIProviderFactory(createDefinitionRepository());
    const services = createAIGatewayServices(factory);
    const response = await services.gateway.createEmbeddings({
      providerKey: "mock",
      context: createGatewayContext("company-1"),
      input: ["VaultOS", "Workflow"],
      model: "mock-embed",
    });
    assert.equal(response.vectors.length, 2);
    assert.equal(response.dimensions, 8);
  });

  it("lists supported providers from registry and legacy factory", () => {
    const factory = new AIProviderFactory(createDefinitionRepository());
    const services = createAIGatewayServices(factory);
    assert.ok(services.gateway.listSupportedProviders().includes("mock"));
    assert.ok(services.gateway.listSupportedProviders().includes("openai"));
  });
});

describe("Cost tracker", () => {
  it("estimates token cost by model", () => {
    const tracker = new CostTracker();
    const cost = tracker.estimateCostUsd("openai", "gpt-4o-mini", {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    });
    assert.ok(cost >= 0);
  });
});

describe("Mock provider", () => {
  it("implements chat, stream, embeddings, and health without network", async () => {
    const provider = createMockEnterpriseProvider({ model: "mock-gpt", latencyMs: 0 });
    const chat = await provider.chatCompletion({ messages: [{ role: "user", content: "ping" }] });
    assert.match(chat.text, /mock/i);
    const embed = await provider.createEmbeddings({ input: "VaultOS" });
    assert.equal(embed.vectors.length, 1);
    const health = await provider.healthCheck();
    assert.equal(health.available, true);
  });
});
