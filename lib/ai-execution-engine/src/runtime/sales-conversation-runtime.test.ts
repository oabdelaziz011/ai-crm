import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSchedulingAgentTools } from "@workspace/ai-tool-router";
import type { SchedulingToolPorts } from "../../../ai-tool-router/src/tools/scheduling-agent-ports.js";
import { createDefaultRuntimeRegistries } from "../registries/runtime-registries.js";
import { RuntimeObservability } from "../observability/runtime-observability.js";
import { ExecutionSessionService } from "./execution-session-service.js";
import { EnterpriseAIRuntimeService } from "./enterprise-ai-runtime-service.js";
import { AIExecutionPolicyService } from "../services/ai-execution-policy-service.js";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";
import { salesCalendarYmd } from "./sales-conversation-turn.js";

const COMPANY_A = "company-a";
const CUSTOMER_ID = "1e6e345e-5180-46fc-9f2b-01f832a6a432";
const buds = {
  productId: "syn-buds",
  name: "Aurora Buds",
  sku: "BUDS-1",
  summary: "Wireless earbuds. Battery 6 hours.",
  price: { status: "listed", amount: 249, currency: "EGP" },
};

function createHarness() {
  let modelCalls = 0;
  let bookings = 0;
  let handoffs = 0;
  let quoteMode: "ok" | "draft-fails" = "ok";
  let nextMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const toolCalls: Array<{ toolKey: string; companyId: string; input: Record<string, unknown> }> = [];

  const demoTools = createSchedulingAgentTools({
    async createDemoBooking() {
      bookings += 1;
      return {
        success: true,
        bookingId: "booking-syn-1",
        confirmationNumber: "BK-SYN-1",
        status: "confirmed",
      };
    },
    async handoffAfterDemoBooking() {
      handoffs += 1;
      return { succeeded: true, ownerType: "human_agent", assigned: true, queued: false };
    },
  } as SchedulingToolPorts);

  const gateway: RuntimeGatewayPort = {
    async chatCompletion() {
      modelCalls += 1;
      throw new Error("model_should_not_be_called");
    },
  };

  const tools: RuntimeToolPort = {
    listLlmTools: () => [{ type: "function", function: { name: "create_demo_booking" } }],
    allowedToolKeys: () => [
      "list_demo_types",
      "create_demo_booking",
      "escalate_to_human",
      "search_products",
      "create_draft_quote",
      "request_send_quote",
    ],
    async route(ctx, request) {
      const toolInput = request.input as Record<string, unknown>;
      toolCalls.push({ toolKey: request.toolKey, companyId: ctx.companyId, input: toolInput });
      if (request.toolKey === "list_demo_types") {
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: { demos: [{ serviceId: "syn-demo", name: "Product demo" }] },
          durationMs: 1,
        };
      }
      if (request.toolKey === "create_demo_booking") {
        const output = await demoTools.create_demo_booking!.execute(
          {
            companyId: ctx.companyId,
            userId: ctx.userId,
            conversationId: request.conversationId,
            conversationState: "waiting_user",
            trustedCustomerId: CUSTOMER_ID,
          },
          toolInput,
        );
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: output as Record<string, unknown>,
          durationMs: 1,
        };
      }
      if (request.toolKey === "search_products") {
        const query = String(toolInput.query ?? "").toLowerCase();
        const products = query.includes("aurora buds") ? [buds] : [];
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: { success: products.length > 0, products },
          durationMs: 1,
        };
      }
      if (request.toolKey === "create_draft_quote") {
        if (quoteMode === "draft-fails") {
          return {
            toolKey: request.toolKey,
            executionId: `exec-${toolCalls.length}`,
            status: "succeeded" as const,
            output: { success: false, sent: false, approved: false, draftOnly: true },
            durationMs: 1,
          };
        }
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: {
            success: true,
            created: true,
            draftOnly: true,
            quoteId: "quote-1",
            quoteNumber: "Q-SYN-1",
            productId: toolInput.productId,
            quantity: toolInput.quantity,
            sent: false,
            approved: false,
          },
          durationMs: 1,
        };
      }
      if (request.toolKey === "request_send_quote") {
        return {
          toolKey: request.toolKey,
          executionId: `exec-${toolCalls.length}`,
          status: "succeeded" as const,
          output: { success: true, sent: false, status: "pending_human_approval" },
          durationMs: 1,
        };
      }
      return {
        toolKey: request.toolKey,
        executionId: `exec-${toolCalls.length}`,
        status: "succeeded" as const,
        output: { success: true },
        durationMs: 1,
      };
    },
  };

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
    registries: createDefaultRuntimeRegistries(),
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

  async function ask(content: string) {
    modelCalls = 0;
    toolCalls.length = 0;
    nextMessages = [{ role: "user", content }];
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
        recentMessages: nextMessages,
        cacheEnabled: false,
      },
    );
    return {
      text: result.responseText,
      modelCalls,
      tools: toolCalls.map((call) => call.toolKey),
      inputs: toolCalls.map((call) => call.input),
      companyIds: toolCalls.map((call) => call.companyId),
    };
  }

  return {
    ask,
    counts: () => ({ bookings, handoffs }),
    resetCounts: () => {
      bookings = 0;
      handoffs = 0;
    },
    setQuoteMode: (mode: "ok" | "draft-fails") => {
      quoteMode = mode;
    },
  };
}

describe("Enterprise runtime demo and quote turns", () => {
  const harness = createHarness();

  it("asks for the missing day and time and does not book", async () => {
    harness.resetCounts();
    const result = await harness.ask("Please book a product demo.");
    assert.deepEqual(result.tools, []);
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /day and the start time/i);
    assert.doesNotMatch(result.text, /BK-SYN|customer id|booked/i);
    assert.deepEqual(harness.counts(), { bookings: 0, handoffs: 0 });
  });

  it("asks only for the missing time when the day is already known", async () => {
    harness.resetCounts();
    const result = await harness.ask("Please book a product demo tomorrow.");
    assert.deepEqual(result.tools, []);
    assert.match(result.text, /start time/i);
    assert.equal(harness.counts().bookings, 0);
  });

  it("books once with the trusted service and hands off once", async () => {
    harness.resetCounts();
    const result = await harness.ask("Please book a product demo tomorrow at 10:00.");
    assert.deepEqual(result.tools, ["list_demo_types", "create_demo_booking"]);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.companyIds[0], COMPANY_A);
    assert.equal(result.inputs[1]?.serviceId, "syn-demo");
    assert.equal(result.inputs[1]?.date, salesCalendarYmd(1));
    assert.equal(result.inputs[1]?.slotStart, "10:00");
    assert.equal(result.inputs[1]?.customerId, undefined);
    assert.match(result.text, /BK-SYN-1/);
    assert.match(result.text, /teammate will continue/i);
    assert.doesNotMatch(result.text, /date_not_bookable|not_listed/);
    assert.deepEqual(harness.counts(), { bookings: 1, handoffs: 1 });
  });

  it("rejects a past date before a booking is created", async () => {
    harness.resetCounts();
    const result = await harness.ask("Please book a product demo on 2023-10-22 at 10:00.");
    assert.equal(result.tools.includes("create_demo_booking"), false);
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /already passed/i);
    assert.doesNotMatch(result.text, /BK-SYN|booked|date_not_bookable/);
    assert.deepEqual(harness.counts(), { bookings: 0, handoffs: 0 });
  });

  it("drafts a quote and requests human approval without sending it", async () => {
    harness.resetCounts();
    harness.setQuoteMode("ok");
    const result = await harness.ask("Please send me a formal quote for one Aurora Buds unit.");
    assert.deepEqual(result.tools, ["search_products", "create_draft_quote", "request_send_quote"]);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.inputs[1]?.productId, "syn-buds");
    assert.equal(result.inputs[1]?.quantity, 1);
    assert.equal(result.inputs[1]?.customerId, undefined);
    assert.equal(result.inputs[2]?.quoteId, "quote-1");
    assert.match(result.text, /Q-SYN-1/);
    assert.match(result.text, /approve/i);
    assert.match(result.text, /has not been sent/i);
    assert.doesNotMatch(result.text, /has been sent|I sent|not_listed|create_draft_quote/);
    assert.equal(harness.counts().bookings, 0);
  });

  it("asks for the product and does not draft when the quote has no product", async () => {
    const result = await harness.ask("Please send me a formal quote.");
    assert.deepEqual(result.tools, []);
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /Which product is the quote for/i);
    assert.doesNotMatch(result.text, /Q-SYN|has been sent|prepared quote/i);
  });

  it("does not request approval or claim a draft when drafting fails", async () => {
    harness.setQuoteMode("draft-fails");
    const result = await harness.ask("Please send me a formal quote for one Aurora Buds unit.");
    assert.deepEqual(result.tools, ["search_products", "create_draft_quote"]);
    assert.equal(result.modelCalls, 0);
    assert.match(result.text, /was not created/i);
    assert.match(result.text, /was not sent/i);
    assert.doesNotMatch(result.text, /Q-SYN|approve/i);
    harness.setQuoteMode("ok");
  });
});
