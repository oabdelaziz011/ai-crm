import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDecisionNodeConfig,
  createDefaultExtractNodeConfig,
  patchDecisionMetadata,
  patchExtractMetadata,
  toAIWorkflowEngineConfig,
} from "@workspace/ai-workflow-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import {
  createWebhookAIWorkflowAutomationRegistry,
  resolveWebhookAiServiceContext,
  type PlatformFeatureEnabledResolver,
} from "./webhook-ai-workflow-bridge.js";

function createStubRuntime() {
  return {
    async buildPrompt() {
      throw new Error("buildPrompt unused");
    },
    async execute(_ctx: unknown, input: { templateKey?: string }) {
      if (input.templateKey === "workflow_extract") {
        return {
          executionId: "exec-extract",
          promptBuildId: "build-extract",
          promptVersionId: "v1",
          templateKey: "workflow_extract",
          providerKey: "stub",
          model: "stub-model",
          responseText: JSON.stringify({
            data: { customer_name: "أحمد", phone: "01000000000" },
            confidence: { overall: 0.9, fields: {}, warnings: [], missingValues: [], correctionHints: [] },
            validation: { ok: true, errors: [], missingRequired: [], unexpectedFields: [] },
          }),
          latencyMs: 10,
          gatewayLatencyMs: 5,
          contextSizeBytes: 32,
          tokenUsage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          estimatedCostUsd: 0.001,
          cacheHit: false,
        };
      }

      if (input.templateKey === "workflow_decision") {
        return {
          executionId: "exec-decision",
          promptBuildId: "build-decision",
          promptVersionId: "v1",
          templateKey: "workflow_decision",
          providerKey: "stub",
          model: "stub-model",
          responseText: JSON.stringify({
            label: "book",
            labels: ["book"],
            confidence: 0.92,
            reasoning: "Customer asked to book an appointment",
          }),
          latencyMs: 10,
          gatewayLatencyMs: 5,
          contextSizeBytes: 32,
          tokenUsage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          estimatedCostUsd: 0.001,
          cacheHit: false,
        };
      }

      throw new Error(`Unexpected template: ${input.templateKey}`);
    },
  };
}

function createActionContext(config: Record<string, unknown>, variables: Record<string, unknown>) {
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1" },
    run: { id: "run-1" },
    session: { id: "session-1" },
    customer: { id: "customer-1" },
    variables,
    currentNode: {
      id: "node-1",
      type: "action",
      config,
    },
    input: {},
    services: {},
    graph: { nodes: [], edges: [] },
  } as never;
}

describe("webhook AI workflow bridge", () => {
  it("executes AI Extract and AI Decision through the webhook action registry", async () => {
    const registry = createWebhookAIWorkflowAutomationRegistry({
      actionDeps: {},
      enterpriseRuntime: createStubRuntime(),
      resolvePlatformFeatureEnabled: async () => true,
    });
    const action = registry.get("action");
    assert.ok(action, "action handler registered");

    const decisionConfig = toAIWorkflowEngineConfig(
      patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
        inputSource: "variable",
        inputVariable: "lastMessage",
        outcomes: [
          { id: "book", label: "book", description: "Book appointment" },
          { id: "pricing", label: "pricing", description: "Ask about prices" },
          { id: "support", label: "support", description: "Need support" },
          { id: "other", label: "other", description: "Other" },
        ],
      }),
    );
    const decisionResult = await action.execute(
      createActionContext(decisionConfig, { lastMessage: "عايز أحجز معاد" }),
    );
    assert.equal(decisionResult.outcome, "continue");
    const decisionLabel = (decisionResult.variables as Record<string, any>)?.decision_result?.value?.label;
    assert.equal(decisionLabel, "book");

    const extractConfig = toAIWorkflowEngineConfig(
      patchExtractMetadata(createDefaultExtractNodeConfig(), {
        inputSource: "variable",
        inputVariable: "lastMessage",
        schema: {
          fields: [
            {
              id: "name",
              name: "customer_name",
              type: "string",
              required: true,
              description: "Customer name",
            },
            {
              id: "phone",
              name: "phone",
              type: "string",
              required: false,
              description: "Phone",
            },
          ],
        },
      }),
    );
    const extractResult = await action.execute(
      createActionContext(extractConfig, {
        lastMessage: "اسمي أحمد ورقمي 01000000000",
      }),
    );
    assert.equal(extractResult.outcome, "continue");
    const extractData = (extractResult.variables as Record<string, any>)?.extract_result?.value?.data;
    assert.equal(extractData?.customer_name, "أحمد");
  });

  it("denies AI node execution when platform feature resolver returns false", async () => {
    const registry = createWebhookAIWorkflowAutomationRegistry({
      actionDeps: {},
      enterpriseRuntime: createStubRuntime(),
      resolvePlatformFeatureEnabled: async () => false,
    });
    const action = registry.get("action");
    assert.ok(action);
    const decisionConfig = toAIWorkflowEngineConfig(
      patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
        inputSource: "variable",
        inputVariable: "lastMessage",
        outcomes: [{ id: "book", label: "book", description: "Book" }],
      }),
    );
    const result = await action.execute(createActionContext(decisionConfig, { lastMessage: "book" }));
    assert.equal(result.outcome, "failed");
    assert.match(String(result.errorMessage ?? ""), /disabled|Workflow AI/i);
  });
});

describe("Part 6A — resolveWebhookAiServiceContext matrix", () => {
  it("C resolver false → DENY workflow flag", async () => {
    const ctx = await resolveWebhookAiServiceContext("company-1", async () => false);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), false);
    assert.equal(ctx.isSuperAdmin, false);
  });

  it("D resolver undefined → DENY", async () => {
    const ctx = await resolveWebhookAiServiceContext(
      "company-1",
      async () => undefined as unknown as boolean,
    );
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), false);
  });

  it("E resolver false → DENY", async () => {
    const ctx = await resolveWebhookAiServiceContext("company-1", async () => false);
    assert.equal(ctx.isAiChatFeatureEnabled?.(), false);
  });

  it("F resolver true → ALLOW", async () => {
    const ctx = await resolveWebhookAiServiceContext("company-1", async () => true);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), true);
    assert.equal(ctx.isAiChatFeatureEnabled?.(), true);
  });

  it("G resolver throws → DENY", async () => {
    const ctx = await resolveWebhookAiServiceContext("company-1", async () => {
      throw new Error("rpc failed");
    });
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), false);
  });

  it("H missing company → DENY (throws)", async () => {
    await assert.rejects(
      () => resolveWebhookAiServiceContext("", async () => true),
      /Missing company context/,
    );
    await assert.rejects(
      () => resolveWebhookAiServiceContext(null, async () => true),
      /Missing company context/,
    );
  });

  it("I/J automation denied while others allowed → workflow DENY", async () => {
    const resolve: PlatformFeatureEnabledResolver = async (_c, key) => {
      if (key === PLATFORM_AI_FEATURE_KEY.AUTOMATION) return false;
      return true;
    };
    const ctx = await resolveWebhookAiServiceContext("company-1", resolve);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), false);
    assert.equal(ctx.isAiChatFeatureEnabled?.(), true);
  });

  it("K valid commercial + platform + tenant → ALLOW", async () => {
    const ctx = await resolveWebhookAiServiceContext("company-1", async () => true);
    assert.equal(ctx.companyId, "company-1");
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), true);
    assert.equal(ctx.isAiChatFeatureEnabled?.(), true);
    assert.equal(ctx.isToolCallingFeatureEnabled?.(), true);
    assert.equal(ctx.isKnowledgeFeatureEnabled?.(), true);
    assert.equal(ctx.isEmbeddingsFeatureEnabled?.(), true);
  });
});
