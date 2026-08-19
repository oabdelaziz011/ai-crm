import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AIProviderFactory,
  createAIProviderAdapterRegistry,
  createStubAdapters,
  type AIProviderDefinitionRecord,
} from "@workspace/ai-provider-layer";
import { DEFAULT_EXECUTION_POLICY } from "../constants.js";
import {
  AIExecutionCancelledError,
  PermissionDeniedError,
  PromptBuildNotFoundError,
  ProviderConnectionNotFoundError,
} from "../errors.js";
import type {
  AIExecutionMetricsRepository,
  AIExecutionRepository,
  PromptBuildReader,
  ProviderConnectionReader,
} from "../repositories/execution-repositories.js";
import { AIExecutionMetricsService } from "./ai-execution-metrics-service.js";
import { AIExecutionPolicyService } from "./ai-execution-policy-service.js";
import { AIExecutionService } from "./ai-execution-service.js";
import type {
  AIExecutionMetricsRecord,
  AIExecutionRecord,
  ServiceContext,
} from "../types.js";
import { mergeExecutionPolicy, normalizeProviderResponse } from "../utils/execution-utils.js";

const openaiDefinition: AIProviderDefinitionRecord = {
  id: "provider-openai",
  key: "openai",
  display_name: "OpenAI",
  description: "OpenAI",
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

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "ai.execution.view" || code === "ai.execution.manage",
    ...overrides,
  };
}

function createEnvironment(options?: {
  failGenerations?: number;
  slowGenerationMs?: number;
  providerUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    source?: "provider";
  };
  tokenUsageOverride?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    source?: "provider";
  };
  aiTokensCommercial?: import("../ports/ai-tokens-commercial-port.js").AiTokensCommercialPort;
}) {
  const executions: AIExecutionRecord[] = [];
  const metrics: AIExecutionMetricsRecord[] = [];
  let generationAttempts = 0;

  const promptBuildReader: PromptBuildReader = {
    findById: async (id) =>
      id === "build-1"
        ? {
            id: "build-1",
            company_id: "company-1",
            conversation_id: "conv-1",
            final_prompt: "Customer asked about store hours.",
            output_contract: { format: "json", instructions: "Return JSON." },
          }
        : null,
  };

  const connectionReader: ProviderConnectionReader = {
    findById: async (id) => {
      if (id === "conn-primary") {
        return {
          id: "conn-primary",
          company_id: "company-1",
          provider_key: "openai",
          configuration: {
            model: "gpt-4o-mini",
            execution_policy: { retry_count: 1, retry_delay_ms: 10, timeout_ms: 1000 },
            fallback_connection_id: "conn-fallback",
          },
          is_default: true,
          is_enabled: true,
        };
      }
      if (id === "conn-fallback") {
        return {
          id: "conn-fallback",
          company_id: "company-1",
          provider_key: "claude",
          configuration: { model: "claude-3-5-sonnet-latest" },
          is_default: false,
          is_enabled: true,
        };
      }
      return null;
    },
    findDefault: async () => ({
      id: "conn-primary",
      company_id: "company-1",
      provider_key: "openai",
      configuration: { model: "gpt-4o-mini" },
      is_default: true,
      is_enabled: true,
    }),
  };

  const definitionRepository = {
    listActive: async () => [openaiDefinition, claudeDefinition],
    listAll: async () => [openaiDefinition, claudeDefinition],
    findById: async (id: string) =>
      id === "provider-openai" ? openaiDefinition : id === "provider-claude" ? claudeDefinition : null,
    findByKey: async (key: string) => {
      if (key === "openai") return openaiDefinition;
      if (key === "claude") return claudeDefinition;
      return null;
    },
  };

  const baseFactory = new AIProviderFactory(
    definitionRepository,
    createAIProviderAdapterRegistry(createStubAdapters()),
  );
  const factory = new AIProviderFactory(definitionRepository);
  factory.resolve = async (input) => {
    const provider = await baseFactory.resolve(input);
    const originalGenerate = provider.generate.bind(provider);
    provider.generate = async (generateInput) => {
      generationAttempts += 1;
      if (options?.slowGenerationMs) {
        await new Promise((resolve) => setTimeout(resolve, options.slowGenerationMs));
      }
      if (options?.failGenerations && generationAttempts <= options.failGenerations) {
        throw new Error("GENERATION_FAILED");
      }
      const generated = await originalGenerate(generateInput);
      if (options?.tokenUsageOverride) {
        return { ...generated, tokenUsage: options.tokenUsageOverride };
      }
      if (options?.providerUsage) {
        return { ...generated, tokenUsage: { ...options.providerUsage, source: "provider" as const } };
      }
      return generated;
    };
    return provider;
  };

  const executionRepository: AIExecutionRepository = {
    create: async (input) => {
      const record: AIExecutionRecord = {
        id: `exec-${executions.length + 1}`,
        company_id: input.companyId,
        conversation_id: input.conversationId ?? null,
        prompt_build_id: input.promptBuildId,
        provider_connection_id: input.providerConnectionId,
        fallback_connection_id: input.fallbackConnectionId ?? null,
        provider_key: input.providerKey,
        model: input.model,
        status: "pending",
        runtime_policy: input.runtimePolicy,
        finish_reason: null,
        raw_response: null,
        normalized_response: null,
        token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        error_code: null,
        error_message: null,
        retry_count: 0,
        used_fallback_provider: false,
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_ms: null,
        created_by: input.createdBy ?? null,
      };
      executions.push(record);
      return record;
    },
    markRunning: async (executionId) => {
      const record = executions.find((item) => item.id === executionId);
      if (!record) throw new Error("Execution not found");
      record.status = "running";
      return record;
    },
    updateRetryCount: async (executionId, retryCount) => {
      const record = executions.find((item) => item.id === executionId);
      if (!record) throw new Error("Execution not found");
      record.retry_count = retryCount;
      return record;
    },
    complete: async (input) => {
      const record = executions.find((item) => item.id === input.executionId);
      if (!record) throw new Error("Execution not found");
      Object.assign(record, {
        status: input.status,
        finish_reason: input.finishReason ?? null,
        raw_response: input.rawResponse ?? null,
        normalized_response: input.normalizedResponse ?? null,
        token_usage: input.tokenUsage,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        retry_count: input.retryCount,
        used_fallback_provider: input.usedFallbackProvider,
        completed_at: new Date().toISOString(),
        duration_ms: input.durationMs,
        fallback_connection_id: input.fallbackConnectionId ?? record.fallback_connection_id,
        ...(input.providerKey ? { provider_key: input.providerKey } : {}),
        ...(input.model ? { model: input.model } : {}),
      });
      return record;
    },
    findById: async (id) => executions.find((item) => item.id === id) ?? null,
    list: async () => executions,
  };

  const metricsRepository: AIExecutionMetricsRepository = {
    create: async (input) => {
      const record: AIExecutionMetricsRecord = {
        id: `metric-${metrics.length + 1}`,
        company_id: input.companyId,
        execution_id: input.executionId,
        provider_key: input.providerKey,
        model: input.model,
        status: input.status,
        latency_ms: input.latencyMs,
        prompt_tokens: input.tokenUsage.prompt_tokens,
        completion_tokens: input.tokenUsage.completion_tokens,
        total_tokens: input.tokenUsage.total_tokens,
        retry_count: input.retryCount,
        used_fallback_provider: input.usedFallbackProvider,
        recorded_at: new Date().toISOString(),
      };
      metrics.push(record);
      return record;
    },
    findByExecutionId: async (executionId) => metrics.find((item) => item.execution_id === executionId) ?? null,
    list: async () => metrics,
  };

  const policyService = new AIExecutionPolicyService();
  const executionService = new AIExecutionService(
    executionRepository,
    metricsRepository,
    promptBuildReader,
    connectionReader,
    factory,
    policyService,
    options?.aiTokensCommercial,
  );
  const metricsService = new AIExecutionMetricsService(executionRepository, metricsRepository);

  return {
    executionService,
    metricsService,
    policyService,
    executions,
    metrics,
    getGenerationAttempts: () => generationAttempts,
  };
}

describe("AIExecutionPolicyService", () => {
  it("merges connection policy with overrides", () => {
    const service = new AIExecutionPolicyService();
    const policy = service.resolvePolicy(
      {
        id: "conn-1",
        company_id: "company-1",
        provider_key: "openai",
        configuration: {
          model: "gpt-4o-mini",
          execution_policy: { temperature: 0.5, retry_count: 1 },
        },
        is_default: true,
        is_enabled: true,
      },
      { max_tokens: 512 },
    );

    assert.equal(policy.temperature, 0.5);
    assert.equal(policy.max_tokens, 512);
    assert.equal(policy.retry_count, 1);
  });
});

describe("execution utilities", () => {
  it("normalizes stub provider responses independently from provider syntax", () => {
    const normalized = normalizeProviderResponse(
      "openai",
      {
        text: "We are open 9am to 5pm.",
        model: "gpt-4o-mini",
        providerKey: "openai",
        mock: true,
      },
      {
        id: "build-1",
        company_id: "company-1",
        conversation_id: "conv-1",
        final_prompt: "hours?",
        output_contract: { format: "json", instructions: "Return JSON." },
      },
      { ...DEFAULT_EXECUTION_POLICY, response_format: "json" },
    );

    assert.equal(normalized.normalized.format, "json");
    assert.equal(typeof normalized.normalized.content, "object");
  });

  it("merges fallback connection id from configuration", () => {
    const policy = mergeExecutionPolicy({
      fallback_connection_id: "conn-fallback",
      execution_policy: { timeout_ms: 1500 },
    });
    assert.equal(policy.fallback_connection_id, "conn-fallback");
    assert.equal(policy.timeout_ms, 1500);
  });
});

describe("AIExecutionService", () => {
  it("executes through the provider factory and records metrics", async () => {
    const { executionService, metrics, executions } = createEnvironment();

    const result = await executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.provider_key, "openai");
    assert.ok(result.latency_ms >= 0);
    assert.equal(result.token_usage.total_tokens, 0);
    assert.equal(result.token_usage.source, undefined);
    assert.ok(result.normalized_response);
    assert.equal(metrics.length, 1);
    assert.equal(executions.length, 1);
  });

  it("preserves provider-reported tokenUsage and does not estimate", async () => {
    const { executionService } = createEnvironment({
      providerUsage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    });

    const result = await executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });

    assert.equal(result.token_usage.prompt_tokens, 11);
    assert.equal(result.token_usage.completion_tokens, 7);
    assert.equal(result.token_usage.total_tokens, 18);
    assert.equal(result.token_usage.source, "provider");
  });

  it("selects the default provider connection when none is specified", async () => {
    const { executionService } = createEnvironment();
    const result = await executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
    });
    assert.equal(result.provider_key, "openai");
  });

  it("retries failed executions before succeeding", async () => {
    const env = createEnvironment({ failGenerations: 1 });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.retry_count, 1);
  });

  it("uses fallback provider after retries are exhausted", async () => {
    const env = createEnvironment({ failGenerations: 2 });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });

    assert.equal(result.status, "fallback");
    assert.equal(result.used_fallback_provider, true);
    assert.equal(result.provider_key, "claude");
  });

  it("handles provider timeouts", async () => {
    const env = createEnvironment({ slowGenerationMs: 1500 });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
      policy: { timeout_ms: 50, retry_count: 0 },
    });

    assert.equal(result.status, "timeout");
    assert.equal(result.error_code, "AI_EXECUTION_TIMEOUT");
  });

  it("rejects missing prompt builds", async () => {
    const { executionService } = createEnvironment();
    await assert.rejects(
      () =>
        executionService.execute(createContext(), {
          companyId: "company-1",
          promptBuildId: "missing-build",
          providerConnectionId: "conn-primary",
        }),
      PromptBuildNotFoundError,
    );
  });

  it("rejects missing provider connections", async () => {
    const { executionService } = createEnvironment();
    await assert.rejects(
      () =>
        executionService.execute(createContext(), {
          companyId: "company-1",
          promptBuildId: "build-1",
          providerConnectionId: "missing-conn",
        }),
      ProviderConnectionNotFoundError,
    );
  });

  it("requires manage permission", async () => {
    const { executionService } = createEnvironment();
    await assert.rejects(
      () =>
        executionService.execute(createContext({ hasPermission: () => false }), {
          companyId: "company-1",
          promptBuildId: "build-1",
          providerConnectionId: "conn-primary",
        }),
      PermissionDeniedError,
    );
  });

  it("rejects pre-cancelled executions", async () => {
    const { executionService } = createEnvironment();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      () =>
        executionService.execute(createContext(), {
          companyId: "company-1",
          promptBuildId: "build-1",
          providerConnectionId: "conn-primary",
          abortSignal: controller.signal,
        }),
      AIExecutionCancelledError,
    );
  });

  it("A. entitlement denied → generate is not called", async () => {
    const env = createEnvironment({
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: false, reason: "not_entitled" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "AI_ASSISTANT_NOT_ENTITLED");
    assert.equal(env.getGenerationAttempts(), 0);
  });

  it("B. quota already exceeded → generate is not called", async () => {
    const env = createEnvironment({
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: false, reason: "quota_exceeded" };
        },
        async recordUsage() {
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error_code, "AI_TOKENS_QUOTA_EXCEEDED");
    assert.equal(env.getGenerationAttempts(), 0);
  });

  it("C/D. quota available + provider usage → one commercial event with quantity 100", async () => {
    const recorded: Array<{ companyId: string; executionId: string; quantity: number }> = [];
    const env = createEnvironment({
      providerUsage: { prompt_tokens: 40, completion_tokens: 60, total_tokens: 100 },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          recorded.push(input);
          return { recorded: true, reason: "recorded" };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(env.getGenerationAttempts(), 1);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.quantity, 100);
    assert.equal(recorded[0]?.companyId, "company-1");
    assert.equal(recorded[0]?.executionId, result.execution_id);
  });

  it("F. successful response with missing usage → zero commercial events", async () => {
    let recordCalls = 0;
    const env = createEnvironment({
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(recordCalls, 0);
  });

  it("G. estimated usage is not commercially metered", async () => {
    let recordCalls = 0;
    const env = createEnvironment({
      tokenUsageOverride: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(recordCalls, 0);
  });

  it("H. provider failure → zero commercial events", async () => {
    let recordCalls = 0;
    const env = createEnvironment({
      failGenerations: 10,
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.notEqual(result.status, "succeeded");
    assert.equal(recordCalls, 0);
  });

  it("I. metering failure after success does not re-execute generate", async () => {
    const env = createEnvironment({
      providerUsage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          throw new Error("ingest failed");
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(env.getGenerationAttempts(), 1);
  });

  it("K. tenant isolation — company A cannot meter company B", async () => {
    const recorded: string[] = [];
    const env = createEnvironment({
      providerUsage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      aiTokensCommercial: {
        async checkAccess(input) {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          recorded.push(input.companyId);
          return { recorded: true };
        },
      },
    });
    await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.deepEqual(recorded, ["company-1"]);
  });

  it("M. zero token provider usage → no commercial event", async () => {
    let recordCalls = 0;
    const env = createEnvironment({
      tokenUsageOverride: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        source: "provider",
      },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage() {
          recordCalls += 1;
          return { recorded: true };
        },
      },
    });
    await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(recordCalls, 0);
  });

  it("E. streaming success with provider usage meters once", async () => {
    const recorded: number[] = [];
    const env = createEnvironment({
      providerUsage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          recorded.push(input.quantity);
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
      policy: { streaming: true },
    });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(recorded, [20]);
  });

  it("N. retries then success meters one commercial record", async () => {
    const recorded: string[] = [];
    const env = createEnvironment({
      failGenerations: 1,
      providerUsage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      aiTokensCommercial: {
        async checkAccess() {
          return { allowed: true, reason: "entitled" };
        },
        async recordUsage(input) {
          recorded.push(input.executionId);
          return { recorded: true };
        },
      },
    });
    const result = await env.executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0], result.execution_id);
  });
});

describe("AIExecutionMetricsService", () => {
  it("returns persisted execution metrics", async () => {
    const { executionService, metricsService } = createEnvironment();
    const result = await executionService.execute(createContext(), {
      companyId: "company-1",
      promptBuildId: "build-1",
      providerConnectionId: "conn-primary",
    });

    const snapshot = await metricsService.getExecutionMetrics(createContext(), result.execution_id);
    assert.equal(snapshot.metrics.execution_id, result.execution_id);
    assert.equal(snapshot.metrics.total_tokens, 0);
  });
});
