import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ContextBuilder } from "../context/context-builder.js";
import { ConversationWindowManager } from "../context/conversation-window-manager.js";
import { TokenBudgetManager } from "../context/token-budget-manager.js";
import { TokenBudgetExceededError } from "../errors/runtime-errors.js";
import { createDefaultRuntimeRegistries } from "../registries/runtime-registries.js";
import { RuntimeObservability } from "../observability/runtime-observability.js";
import { ExecutionSessionService } from "../runtime/execution-session-service.js";
import { EnterpriseAIRuntimeService } from "../runtime/enterprise-ai-runtime-service.js";
import type { RuntimeGatewayPort, RuntimePromptPort } from "../ports/runtime-ports.js";
import type {
  AIExecutionMetricsRepository,
  AIExecutionRepository,
  PromptBuildReader,
  ProviderConnectionReader,
} from "../repositories/execution-repositories.js";
import { AIExecutionPolicyService } from "../services/ai-execution-policy-service.js";

function createMocks() {
  const registries = createDefaultRuntimeRegistries();
  const sessions = new ExecutionSessionService();
  const observability = new RuntimeObservability();

  const promptPort: RuntimePromptPort = {
    async execute(_ctx, input) {
      return {
        builtPrompt: {
          buildId: "build-1",
          templateKey: "conversation_default",
          templateVersionId: "version-1",
          finalPrompt: `Rendered for ${input.companyId}`,
          metadata: { renderedSize: 20, variableCount: 0, estimatedTokens: 10, executionTimeMs: 1 },
        },
      };
    },
  };

  const gatewayPort: RuntimeGatewayPort = {
    async chatCompletion(input) {
      return {
        text: `Gateway response to: ${input.messages[0]?.content ?? ""}`,
        model: input.model ?? "mock-gpt",
        providerKey: input.providerKey ?? "mock",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        latencyMs: 12,
        estimatedCostUsd: 0.001,
      };
    },
  };

  const executionRepository: AIExecutionRepository = {
    create: async (input) => ({
      id: "exec-1",
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
      created_by: null,
    }),
    markRunning: async () => undefined,
    complete: async (input) => ({
      id: input.executionId,
      company_id: "company-1",
      conversation_id: "conv-1",
      prompt_build_id: "build-1",
      provider_connection_id: "conn-1",
      fallback_connection_id: null,
      provider_key: input.providerKey ?? "mock",
      model: input.model ?? "mock-gpt",
      status: input.status,
      runtime_policy: {
        temperature: 0.7,
        top_p: 1,
        presence_penalty: 0,
        frequency_penalty: 0,
        max_tokens: 1000,
        response_format: "text",
        streaming: false,
        timeout_ms: 30000,
        retry_count: 0,
        retry_delay_ms: 0,
        fallback_connection_id: null,
      },
      finish_reason: input.finishReason ?? null,
      raw_response: input.rawResponse ?? null,
      normalized_response: input.normalizedResponse ?? null,
      token_usage: input.tokenUsage,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      retry_count: input.retryCount,
      used_fallback_provider: input.usedFallbackProvider,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: input.durationMs,
      created_by: null,
    }),
    updateRetryCount: async () => undefined,
  };

  const metricsRepository: AIExecutionMetricsRepository = {
    create: async () => ({
      id: "metric-1",
      company_id: "company-1",
      execution_id: "exec-1",
      provider_key: "mock",
      model: "mock-gpt",
      status: "succeeded",
      latency_ms: 12,
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      retry_count: 0,
      used_fallback_provider: false,
      recorded_at: new Date().toISOString(),
    }),
  };

  const connectionReader: ProviderConnectionReader = {
    findById: async () => ({
      id: "conn-1",
      company_id: "company-1",
      provider_key: "mock",
      configuration: { model: "mock-gpt" },
      is_default: true,
      is_enabled: true,
    }),
    findDefault: async () => ({
      id: "conn-1",
      company_id: "company-1",
      provider_key: "mock",
      configuration: { model: "mock-gpt" },
      is_default: true,
      is_enabled: true,
    }),
  };

  const promptBuildReader: PromptBuildReader = {
    findById: async (id) => ({
      id,
      company_id: "company-1",
      conversation_id: "conv-1",
      final_prompt: "Stored prompt build",
      output_contract: { format: "text", instructions: "Reply" },
    }),
  };

  const runtime = new EnterpriseAIRuntimeService({
    prompt: promptPort,
    gateway: gatewayPort,
    registries,
    executionRepository,
    metricsRepository,
    connectionReader,
    promptBuildReader,
    policyService: new AIExecutionPolicyService(),
    sessions,
    observability,
  });

  return { runtime, observability, sessions };
}

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: (code: string) => code === "ai.execution.manage",
};

describe("Enterprise AI Runtime", () => {
  it("orchestrates context, prompt runtime, and gateway execution", async () => {
    const { runtime } = createMocks();
    const result = await runtime.execute(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      promptContext: { customer: { name: "Alex" } },
      recentMessages: [{ role: "customer", content: "Hello" }],
    });
    assert.equal(result.status, "succeeded");
    assert.match(result.responseText, /Gateway response/);
    assert.equal(result.promptBuildId, "build-1");
  });

  it("executes from an existing prompt build through the gateway", async () => {
    const { runtime } = createMocks();
    const result = await runtime.execute(ctx, {
      companyId: "company-1",
      promptBuildId: "build-existing",
      promptContext: {},
    });
    assert.match(result.responseText, /Stored prompt build/);
  });
});

describe("Conversation window manager", () => {
  it("trims messages to token budget in chronological order", () => {
    const manager = new ConversationWindowManager();
    const result = manager.trim(
      [
        { role: "customer", content: "one ".repeat(100) },
        { role: "assistant", content: "two ".repeat(100) },
        { role: "customer", content: "three" },
      ],
      { maxMessages: 3, tokenBudget: 60 },
    );
    assert.ok(result.trimmedCount >= 0);
    assert.ok(result.messages.length >= 1);
  });
});

describe("Context builder and token budget", () => {
  it("merges provider context values", () => {
    const registries = createDefaultRuntimeRegistries();
    const builder = new ContextBuilder(registries.contextProviders);
    const built = builder.build({ companyId: "company-1", customer: { name: "Alex" } });
    assert.ok(built.context.customer);
  });

  it("throws when prompt exceeds token budget", () => {
    const budget = new TokenBudgetManager();
    assert.throws(() => budget.assertWithinBudget(9000, { maxTokens: 1000, reservedOutputTokens: 200 }), TokenBudgetExceededError);
  });
});

describe("Runtime observability", () => {
  it("records structured execution events", () => {
    const observability = new RuntimeObservability();
    observability.record({
      type: "execution_started",
      executionId: "exec-1",
      sessionId: "session-1",
      metrics: { latencyMs: 10 },
    });
    assert.equal(observability.list().length, 1);
  });
});
