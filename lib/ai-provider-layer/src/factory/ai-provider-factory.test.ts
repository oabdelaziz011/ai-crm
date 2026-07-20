import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIProviderFactory } from "../factory/ai-provider-factory.js";
import {
  AIProviderConfigurationError,
  AIProviderDisabledError,
  UnsupportedAIProviderError,
  ValidationError,
} from "../errors.js";
import type {
  AIProviderConnectionRepository,
  AIProviderDefinitionRepository,
} from "../repositories/provider-repositories.js";
import { AIProviderHealthService } from "../services/ai-provider-health-service.js";
import { AIProviderRegistryService } from "../services/ai-provider-registry-service.js";
import type { AIProviderConnectionRecord, AIProviderDefinitionRecord, ServiceContext } from "../types.js";

const openaiDefinition: AIProviderDefinitionRecord = {
  id: "provider-openai",
  key: "openai",
  display_name: "OpenAI",
  description: "OpenAI provider",
  icon: "openai",
  supports_generate: true,
  supports_classify: true,
  supports_embed: true,
  supports_streaming: false,
  configuration_schema: {
    type: "object",
    properties: { model: { type: "string" } },
    required: ["model"],
  },
  default_configuration: { model: "gpt-4o-mini" },
  is_active: true,
  version: "1.0.0",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const claudeDefinition: AIProviderDefinitionRecord = {
  ...openaiDefinition,
  id: "provider-claude",
  key: "claude",
  display_name: "Claude",
  default_configuration: { model: "claude-3-5-sonnet-latest" },
};

const deepseekDefinition: AIProviderDefinitionRecord = {
  ...openaiDefinition,
  id: "provider-deepseek",
  key: "deepseek",
  display_name: "DeepSeek",
  is_active: true,
};

const disabledDefinition: AIProviderDefinitionRecord = {
  ...openaiDefinition,
  id: "provider-disabled",
  key: "openai-disabled",
  is_active: false,
};

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "ai.providers.view" || code === "ai.providers.manage",
    ...overrides,
  };
}

function createMemoryEnvironment(options?: {
  definitions?: AIProviderDefinitionRecord[];
  connections?: AIProviderConnectionRecord[];
}) {
  const definitions = options?.definitions ?? [openaiDefinition, claudeDefinition, deepseekDefinition];
  const connections = [...(options?.connections ?? [])];

  const definitionRepository: AIProviderDefinitionRepository = {
    listActive: async () => definitions.filter((item) => item.is_active),
    listAll: async () => definitions,
    findById: async (id) => definitions.find((item) => item.id === id) ?? null,
    findByKey: async (key) => definitions.find((item) => item.key === key) ?? null,
  };

  const connectionRepository: AIProviderConnectionRepository = {
    create: async (input) => {
      const provider = definitions.find((item) => item.id === input.providerId);
      const record: AIProviderConnectionRecord = {
        id: `conn-${connections.length + 1}`,
        company_id: input.companyId,
        provider_id: input.providerId,
        display_name: input.displayName,
        status: input.status ?? "pending",
        configuration: input.configuration ?? {},
        is_default: input.isDefault ?? false,
        is_enabled: input.isEnabled ?? false,
        health_status: input.healthStatus ?? "unknown",
        last_health_check: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
        ai_provider_definition: provider ?? null,
      };
      connections.push(record);
      return record;
    },
    findById: async (id) => connections.find((item) => item.id === id && !item.deleted_at) ?? null,
    list: async (filter) =>
      connections.filter(
        (item) =>
          item.company_id === filter.companyId &&
          !item.deleted_at &&
          (filter.isEnabled === undefined || item.is_enabled === filter.isEnabled),
      ),
    update: async (input) => {
      const record = connections.find((item) => item.id === input.connectionId);
      if (!record) throw new Error("Connection not found");
      if (input.configuration !== undefined) record.configuration = input.configuration;
      if (input.displayName !== undefined) record.display_name = input.displayName;
      if (input.status !== undefined) record.status = input.status;
      if (input.isEnabled !== undefined) record.is_enabled = input.isEnabled;
      if (input.isDefault !== undefined) record.is_default = input.isDefault;
      record.updated_at = new Date().toISOString();
      return record;
    },
    updateHealth: async (input) => {
      const record = connections.find((item) => item.id === input.connectionId);
      if (!record) throw new Error("Connection not found");
      record.health_status = input.healthStatus;
      record.last_health_check = input.lastHealthCheck ?? new Date().toISOString();
      return record;
    },
    softDelete: async (connectionId) => {
      const record = connections.find((item) => item.id === connectionId);
      if (!record) throw new Error("Connection not found");
      record.deleted_at = new Date().toISOString();
      record.is_enabled = false;
      return record;
    },
  };

  const factory = new AIProviderFactory(definitionRepository);
  const registry = new AIProviderRegistryService(definitionRepository, connectionRepository, factory);
  const health = new AIProviderHealthService(connectionRepository, factory);

  return { factory, registry, health, connections, definitions };
}

describe("AIProviderFactory", () => {
  it("resolves supported stub adapters", async () => {
    const { factory } = createMemoryEnvironment();
    const provider = await factory.resolve({
      providerKey: "openai",
      configuration: { model: "gpt-4o-mini" },
    });

    const result = await provider.generate({ prompt: "Hello" });
    assert.equal(result.providerKey, "openai");
    assert.equal(result.mock, true);
    assert.match(result.text, /OpenAI stub/i);
  });

  it("rejects unsupported providers without adapters", async () => {
    const { factory } = createMemoryEnvironment();

    await assert.rejects(
      () => factory.resolve({ providerKey: "deepseek", configuration: { model: "deepseek-chat" } }),
      UnsupportedAIProviderError,
    );
  });

  it("rejects disabled provider definitions", async () => {
    const { factory } = createMemoryEnvironment({
      definitions: [disabledDefinition],
    });

    await assert.rejects(
      () => factory.resolve({ providerKey: "openai-disabled", configuration: { model: "gpt-4o-mini" } }),
      AIProviderDisabledError,
    );
  });

  it("validates configuration against provider schema", async () => {
    const { factory } = createMemoryEnvironment();
    const validation = await factory.validateConfiguration("openai", { model: 123 as unknown as string });
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join(" "), /model/i);
  });

  it("throws on invalid configuration during resolve", async () => {
    const { factory } = createMemoryEnvironment();

    await assert.rejects(
      () => factory.resolve({ providerKey: "openai", configuration: { model: 123 as unknown as string } }),
      AIProviderConfigurationError,
    );
  });

  it("lists only implemented adapter keys", () => {
    const { factory } = createMemoryEnvironment();
    assert.deepEqual(factory.getSupportedProviderKeys().sort(), [
      "azure_openai",
      "claude",
      "gemini",
      "ollama",
      "openai",
    ]);
  });
});

describe("AIProviderRegistryService", () => {
  it("registers a provider connection with validated configuration", async () => {
    const { registry, connections } = createMemoryEnvironment();

    const connection = await registry.createConnection(createContext(), {
      companyId: "company-1",
      providerId: "provider-openai",
      displayName: "Primary OpenAI",
      configuration: { model: "gpt-4o-mini" },
      isEnabled: true,
      status: "active",
    });

    assert.equal(connection.display_name, "Primary OpenAI");
    assert.equal(connections.length, 1);
  });

  it("rejects connection creation for unsupported providers", async () => {
    const { registry } = createMemoryEnvironment();

    await assert.rejects(
      () =>
        registry.createConnection(createContext(), {
          companyId: "company-1",
          providerId: "provider-deepseek",
          displayName: "DeepSeek",
          configuration: { model: "deepseek-chat" },
        }),
      ValidationError,
    );
  });

  it("rejects invalid configuration during registration", async () => {
    const { registry } = createMemoryEnvironment();

    await assert.rejects(
      () =>
        registry.createConnection(createContext(), {
          companyId: "company-1",
          providerId: "provider-openai",
          displayName: "Broken OpenAI",
          configuration: { model: 123 as unknown as string },
        }),
      ValidationError,
    );
  });
});

describe("AIProviderHealthService", () => {
  it("checks health for enabled connections via factory", async () => {
    const { registry, health } = createMemoryEnvironment();

    const connection = await registry.createConnection(createContext(), {
      companyId: "company-1",
      providerId: "provider-openai",
      displayName: "Primary OpenAI",
      configuration: { model: "gpt-4o-mini" },
      isEnabled: true,
      status: "active",
    });

    const result = await health.checkConnectionHealth(createContext(), connection.id);
    assert.equal(result.providerKey, "openai");
    assert.equal(result.healthStatus, "connected");
    assert.match(result.message, /stub adapter/i);
  });

  it("throws when checking health on disabled connections", async () => {
    const { registry, health } = createMemoryEnvironment();

    const connection = await registry.createConnection(createContext(), {
      companyId: "company-1",
      providerId: "provider-openai",
      displayName: "Disabled OpenAI",
      configuration: { model: "gpt-4o-mini" },
      isEnabled: false,
      status: "disabled",
    });

    await assert.rejects(
      () => health.checkConnectionHealth(createContext(), connection.id),
      AIProviderDisabledError,
    );
  });
});

describe("Stub adapter contract", () => {
  it("implements generate, classify, embed, health, and models without network calls", async () => {
    const { factory } = createMemoryEnvironment();
    const provider = await factory.resolve({
      providerKey: "claude",
      configuration: { model: "claude-3-5-sonnet-latest" },
    });

    const [generated, classified, embedded, health, models] = await Promise.all([
      provider.generate({ prompt: "Test prompt" }),
      provider.classify({ text: "Book appointment", labels: ["booking_request"] }),
      provider.embed({ text: "VaultOS" }),
      provider.health(),
      provider.models(),
    ]);

    assert.equal(generated.mock, true);
    assert.equal(classified.mock, true);
    assert.equal(embedded.mock, true);
    assert.equal(health.mock, true);
    assert.equal(models.mock, true);
    assert.ok(models.models.length > 0);
  });
});
