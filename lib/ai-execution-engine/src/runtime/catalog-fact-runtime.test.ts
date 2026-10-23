import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultRuntimeRegistries } from "../registries/runtime-registries.js";
import { RuntimeObservability } from "../observability/runtime-observability.js";
import { ExecutionSessionService } from "./execution-session-service.js";
import { EnterpriseAIRuntimeService } from "./enterprise-ai-runtime-service.js";
import { AIExecutionPolicyService } from "../services/ai-execution-policy-service.js";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";

const COMPANY_A = "company-a";
const COMPANY_B_SECRET = "HELIX-8841";

const buds = {
  productId: "syn-buds",
  name: "Aurora Buds",
  sku: "BUDS-1",
  summary: "Wireless earbuds. Battery 6 hours. Bluetooth 5.3.",
  price: { status: "listed", amount: 249, currency: "EGP" },
};
const studio = {
  productId: "syn-studio",
  name: "Aurora Studio",
  sku: "STUDIO-1",
  summary: "Over-ear headphones. Battery 30 hours. Bluetooth 5.3. Noise cancelling: yes.",
  price: { status: "not_listed" },
};

type CatalogMode = "catalog" | "empty" | "throw";

function createHarness() {
  let modelCalls = 0;
  let allowModel = false;
  let catalogMode: CatalogMode = "catalog";
  let nextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const toolCalls: Array<{ toolKey: string; companyId: string; input: unknown }> = [];

  const gateway: RuntimeGatewayPort = {
    async chatCompletion() {
      modelCalls += 1;
      if (!allowModel) throw new Error("model_should_not_be_called");
      return {
        text: "MODEL_REPLY",
        model: "gpt-4o-mini",
        providerKey: "mock",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      };
    },
  };

  const tools: RuntimeToolPort = {
    listLlmTools: () => [{ type: "function", function: { name: "search_products" } }],
    allowedToolKeys: () => ["search_products", "get_product_details"],
    async route(ctx, request) {
      toolCalls.push({ toolKey: request.toolKey, companyId: ctx.companyId, input: request.input });
      if (catalogMode === "throw") throw new Error("catalog down");
      if (request.toolKey === "get_product_details") {
        const ids = Array.isArray((request.input as { productIds?: unknown }).productIds)
          ? (request.input as { productIds: string[] }).productIds
          : [];
        const products =
          catalogMode === "empty" ? [] : [buds, studio].filter((product) => ids.includes(product.productId));
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: { success: products.length > 0, products },
          durationMs: 1,
        };
      }
      const query = String((request.input as { query?: unknown }).query ?? "").toLowerCase();
      const matched = [buds, studio].filter((product) => {
        if (!query.trim()) return true;
        const name = product.name.toLowerCase();
        const sku = product.sku.toLowerCase();
        return query.includes(name) || name.includes(query) || query.includes(sku) || sku.includes(query);
      });
      const products = catalogMode === "empty" ? [] : matched;
      return {
        toolKey: request.toolKey,
        executionId: `exec-${toolCalls.length}`,
        status: "succeeded" as const,
        output: { success: catalogMode !== "empty", products },
        durationMs: 1,
      };
    },
  };

  const registries = createDefaultRuntimeRegistries();
  const runtime = new EnterpriseAIRuntimeService({
    prompt: {
      async execute() {
        return {
          builtPrompt: {
            buildId: "build-memory",
            templateKey: "conversation_default",
            templateVersionId: "version-memory",
            finalPrompt: nextMessages.map((message) => message.content).join("\n"),
            gatewayMessages: nextMessages,
            metadata: { renderedSize: 20, variableCount: 0, estimatedTokens: 10, executionTimeMs: 1 },
          },
        };
      },
    },
    gateway,
    tools,
    registries,
    executionRepository: {
      create: async (input) => ({
        id: "exec-memory",
        company_id: input.companyId,
        conversation_id: input.conversationId ?? null,
        prompt_build_id: input.promptBuildId,
        provider_connection_id: input.providerConnectionId,
        fallback_connection_id: null,
        provider_key: input.providerKey,
        model: input.model,
        status: "pending" as const,
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
        company_id: COMPANY_A,
        conversation_id: "conv-1",
        prompt_build_id: "build-memory",
        provider_connection_id: "conn-1",
        fallback_connection_id: null,
        provider_key: "mock",
        model: "gpt-4o-mini",
        status: input.status,
        runtime_policy: input.runtimePolicy ?? {
          temperature: 0.2,
          top_p: 1,
          presence_penalty: 0,
          frequency_penalty: 0,
          max_tokens: 220,
          response_format: "text" as const,
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
        error_code: null,
        error_message: null,
        retry_count: 0,
        used_fallback_provider: false,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: input.durationMs,
        created_by: null,
      }),
      updateRetryCount: async () => undefined,
    },
    metricsRepository: {
      create: async () => ({
        id: "metric-memory",
        company_id: COMPANY_A,
        execution_id: "exec-memory",
        provider_key: "mock",
        model: "gpt-4o-mini",
        status: "succeeded" as const,
        latency_ms: 1,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        retry_count: 0,
        used_fallback_provider: false,
        recorded_at: new Date().toISOString(),
      }),
    },
    connectionReader: {
      findById: async () => null,
      findDefault: async () => ({
        id: "conn-memory",
        company_id: COMPANY_A,
        provider_key: "mock",
        configuration: { model: "gpt-4o-mini" },
        is_default: true,
        is_enabled: true,
        uses_platform_key: false,
      }),
    },
    promptBuildReader: { findById: async () => null },
    policyService: new AIExecutionPolicyService(),
    sessions: new ExecutionSessionService(),
    observability: new RuntimeObservability(),
  });

  async function ask(messages: Array<{ role: "user" | "assistant"; content: string }>, mode: CatalogMode = "catalog") {
    modelCalls = 0;
    toolCalls.length = 0;
    allowModel = false;
    catalogMode = mode;
    nextMessages = messages;
    const result = await runtime.execute(
      {
        userId: "user-1",
        companyId: COMPANY_A,
        isSuperAdmin: false,
        hasPermission: (code: string) => code === "ai.execution.manage",
      },
      {
        companyId: COMPANY_A,
        conversationId: "conv-synthetic",
        promptContext: {},
        recentMessages: messages,
        cacheEnabled: false,
      },
    );
    return {
      text: result.responseText,
      modelCalls,
      tools: toolCalls.map((call) => call.toolKey),
      queries: toolCalls.map((call) => String((call.input as { query?: unknown }).query ?? "")),
      inputs: toolCalls.map((call) => call.input as { query?: unknown; productIds?: string[] }),
      companyIds: toolCalls.map((call) => call.companyId),
    };
  }

  async function askWithModel(messages: Array<{ role: "user" | "assistant"; content: string }>) {
    modelCalls = 0;
    toolCalls.length = 0;
    allowModel = true;
    catalogMode = "catalog";
    nextMessages = messages;
    const result = await runtime.execute(
      {
        userId: "user-1",
        companyId: COMPANY_A,
        isSuperAdmin: false,
        hasPermission: (code: string) => code === "ai.execution.manage",
      },
      {
        companyId: COMPANY_A,
        conversationId: "conv-synthetic",
        promptContext: {},
        recentMessages: messages,
        cacheEnabled: false,
      },
    );
    return {
      text: result.responseText,
      modelCalls,
      tools: toolCalls.map((call) => call.toolKey),
    };
  }

  return { ask, askWithModel };
}

describe("Enterprise runtime catalog-fact force path", () => {
  const harness = createHarness();

  it("looks up a published price before answering and does not call the model", async () => {
    const result = await harness.ask([{ role: "user", content: "What is the price of Aurora Buds?" }]);
    assert.deepEqual(result.tools, ["search_products", "get_product_details"]);
    assert.deepEqual(result.inputs[1]?.productIds, ["syn-buds"]);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.companyIds[0], COMPANY_A);
    assert.match(result.queries[0] ?? "", /Aurora Buds/i);
    assert.match(result.text, /249/);
    assert.match(result.text, /Aurora Buds/);
    assert.doesNotMatch(result.text, /not_listed|not listed|HELIX-8841/i);
    assert.doesNotMatch(result.text, new RegExp(COMPANY_B_SECRET));
  });

  it("looks up a specification before answering", async () => {
    const result = await harness.ask([{ role: "user", content: "What is the battery life of Aurora Buds?" }]);
    assert.deepEqual(result.tools, ["search_products", "get_product_details"]);
    assert.deepEqual(result.inputs[1]?.productIds, ["syn-buds"]);
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /6 hours/);
    assert.match(result.text, /Aurora Buds/);
    assert.match(result.text, /SKU:/);
    assert.doesNotMatch(result.text, /not_listed|not listed|الرمز/);
    assert.doesNotMatch(result.text, /waterproof[^.\n]{0,40}\byes\b/i);
  });

  it("answers an unpublished price without an internal status", async () => {
    const result = await harness.ask([{ role: "user", content: "What is the price of Aurora Studio?" }]);
    assert.equal(result.tools[0], "search_products");
    assert.deepEqual(result.inputs[1]?.productIds, ["syn-studio"]);
    assert.equal(result.modelCalls, 0);
    assert.match(result.queries[0] ?? "", /Aurora Studio/i);
    assert.match(result.text, /not available right now/i);
    assert.doesNotMatch(result.text, /249|not_listed|not listed/);
  });

  it("looks up an unpublished feature without claiming it exists", async () => {
    const result = await harness.ask([{ role: "user", content: "Are the Aurora Buds waterproof?" }]);
    assert.equal(result.tools[0], "search_products");
    assert.equal(result.modelCalls, 0);
    assert.doesNotMatch(result.text, /waterproof[^.\n]{0,40}\byes\b/i);
    assert.doesNotMatch(result.text, /not_listed/);
  });

  it("looks up both products before a comparison", async () => {
    const result = await harness.ask([{ role: "user", content: "Compare Aurora Buds and Aurora Studio." }]);
    assert.equal(result.tools[0], "search_products");
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /Aurora Buds/);
    assert.match(result.text, /Aurora Studio/);
    assert.match(result.text, /6 hours/);
    assert.match(result.text, /30 hours/);
    assert.match(result.text, /SKU:/);
    assert.doesNotMatch(result.text, /249|not_listed|not listed|الرمز/);
  });

  it("reuses one earlier product instead of searching leftover words", async () => {
    const price = await harness.ask([
      { role: "user", content: "ما رأيك في Aurora Studio؟" },
      { role: "user", content: "ما السعر؟" },
    ]);
    assert.equal(price.tools[0], "search_products");
    assert.equal(price.modelCalls, 0);
    assert.equal(price.queries[0], "Aurora Studio");
    assert.deepEqual(price.inputs[1]?.productIds, ["syn-studio"]);
    assert.match(price.text, /غير متاح حاليًا/);
    assert.doesNotMatch(price.text, /249|not_listed|not listed|is the/);

    const battery = await harness.ask([
      { role: "user", content: "ما رأيك في Aurora Studio؟" },
      { role: "user", content: "ما السعر؟" },
      { role: "user", content: "وهل البطارية جيدة؟" },
    ]);
    assert.equal(battery.queries[0], "Aurora Studio");
    assert.deepEqual(battery.inputs[1]?.productIds, ["syn-studio"]);
    assert.equal(battery.modelCalls, 0);
    assert.match(battery.text, /30 hours/);
    assert.doesNotMatch(battery.text, /249|not_listed|not listed/);
  });

  it("asks which product when the follow-up is ambiguous or has no product", async () => {
    const ambiguous = await harness.ask([
      { role: "user", content: "ما رأيك في Aurora Buds و Aurora Studio؟" },
      { role: "user", content: "ما السعر؟" },
    ]);
    assert.deepEqual(ambiguous.tools, []);
    assert.equal(ambiguous.modelCalls, 0);
    assert.match(ambiguous.text, /أنهي منتج/);
    assert.doesNotMatch(ambiguous.text, /249|not_listed/);

    const bare = await harness.ask([{ role: "user", content: "What is the price?" }]);
    assert.deepEqual(bare.tools, []);
    assert.equal(bare.modelCalls, 0);
    assert.match(bare.text, /Which product do you mean/i);
    assert.doesNotMatch(bare.text, /is the|249|not_listed/);
  });

  it("does not invent a price when the catalog search returns nothing", async () => {
    const result = await harness.ask([{ role: "user", content: "What is the price of Aurora Buds?" }], "empty");
    assert.equal(result.tools[0], "search_products");
    assert.equal(result.modelCalls, 0);
    assert.doesNotMatch(result.text, /249|not_listed/);
    assert.match(result.text, /could not find|not find|ملقتش|مش لاقي/i);
  });

  it("does not invent a price when the catalog search throws", async () => {
    const result = await harness.ask([{ role: "user", content: "What is the price of Aurora Buds?" }], "throw");
    assert.equal(result.tools[0], "search_products");
    assert.equal(result.modelCalls, 0);
    assert.doesNotMatch(result.text, /249/);
    assert.match(result.text, /could not load|تعذّر تحميل/i);
  });
});
