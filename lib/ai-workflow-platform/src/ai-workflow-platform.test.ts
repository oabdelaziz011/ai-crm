import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAIWorkflowExecutionAdapter,
  createAIWorkflowPlatformServices,
  createDefaultAIWorkflowNodeConfig,
  createDefaultAIWorkflowRegistries,
  registerAIWorkflowNode,
  toAIWorkflowEngineConfig,
  fromAIWorkflowEngineConfig,
  type AIWorkflowNodeDefinition,
} from "./index.js";

const sampleDefinition: AIWorkflowNodeDefinition = {
  key: "framework.sample",
  displayName: "Sample Node",
  description: "Framework test node",
  category: "utility",
  icon: "Sparkles",
  version: "1.0.0",
  capabilities: ["supportsContext", "supportsJson"],
  outputModes: ["text", "json"],
  defaultConfig: {
    promptTemplateKey: "workflow.sample",
    outputMode: "text",
  },
};

describe("AI workflow configuration", () => {
  it("round-trips engine config through aiConfig payload", () => {
    const config = createDefaultAIWorkflowNodeConfig("framework.sample", {
      promptTemplateKey: "workflow.sample",
      providerKey: "stub",
    });
    const engine = toAIWorkflowEngineConfig(config);
    const restored = fromAIWorkflowEngineConfig(engine);
    assert.equal(restored?.nodeKey, "framework.sample");
    assert.equal(restored?.promptTemplateKey, "workflow.sample");
    assert.equal(restored?.providerKey, "stub");
  });
});

describe("AI workflow registries", () => {
  it("registers nodes with synced capability and configuration defaults", () => {
    const registries = createDefaultAIWorkflowRegistries();
    registerAIWorkflowNode(registries, sampleDefinition);
    assert.ok(registries.nodes.has("framework.sample"));
    assert.ok(registries.capabilities.has("framework.sample", "supportsJson"));
    const resolved = registries.configurations.resolve("framework.sample");
    assert.equal(resolved.promptTemplateKey, "workflow.sample");
  });

  it("maps output modes through the output mapper registry", () => {
    const registries = createDefaultAIWorkflowRegistries();
    const config = createDefaultAIWorkflowNodeConfig("framework.sample", { outputMode: "boolean" });
    const mapped = registries.outputMappers.map("true", config);
    assert.equal(mapped.mode, "boolean");
    assert.equal(mapped.value, true);
  });
});

describe("AI workflow validation and preview", () => {
  it("flags missing prompt and provider configuration", () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: false,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          throw new Error("not used");
        },
      },
    });
    registerAIWorkflowNode(services.registries, sampleDefinition);
    const config = createDefaultAIWorkflowNodeConfig("framework.sample");
    const validation = services.validator.validate(config);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some((issue) => issue.code === "missing_prompt"));
  });

  it("builds preview snapshots with knowledge summary", () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: false,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          throw new Error("not used");
        },
      },
    });
    const config = createDefaultAIWorkflowNodeConfig("framework.sample", {
      promptTemplateKey: "workflow.sample",
      providerKey: "stub",
      knowledge: {
        enabled: true,
        collectionId: "kb-1",
        embeddingConnectionId: "embed-1",
        vectorStoreConnectionId: "vector-1",
        maxChunks: 4,
        similarityThreshold: 0.8,
        queryTemplate: "{{input}}",
      },
    });
    const preview = services.preview.preview({ config });
    assert.equal(preview.knowledgeEnabled, true);
    assert.match(preview.knowledgeSummary ?? "", /kb-1/);
    assert.equal(preview.promptTemplateKey, "workflow.sample");
  });
});

describe("AI workflow execution adapter", () => {
  it("prepares enterprise runtime requests without exposing runtime internals to workflow code", async () => {
    let captured: Record<string, unknown> | null = null;
    const adapter = createAIWorkflowExecutionAdapter({
      async buildPrompt(_ctx, input) {
        captured = input;
        return {
          buildId: "build-1",
          templateKey: "workflow.sample",
          templateVersionId: "v1",
          finalPrompt: "Hello",
          contextSizeBytes: 12,
        };
      },
      async execute(_ctx, input) {
        captured = input;
        return {
          executionId: "exec-1",
          promptBuildId: "build-1",
          promptVersionId: "v1",
          templateKey: "workflow.sample",
          providerKey: "stub",
          model: "stub-model",
          responseText: '{"ok":true}',
          latencyMs: 10,
          gatewayLatencyMs: 5,
          contextSizeBytes: 12,
          tokenUsage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          estimatedCostUsd: 0,
          cacheHit: false,
        };
      },
    });

    const result = await adapter.execute(
      { userId: "u1", companyId: "c1", isSuperAdmin: false, hasPermission: () => true },
      {
        companyId: "c1",
        workflowId: "flow-1",
        executionId: "run-1",
        templateKey: "workflow.sample",
        workflowVariables: { customer_name: "Ada" },
        providerKey: "stub",
      },
    );

    assert.equal(result.responseText, '{"ok":true}');
    assert.equal(captured?.companyId, "c1");
    assert.deepEqual((captured?.promptContext as Record<string, unknown>)?.workflowVariables, {
      customer_name: "Ada",
    });
  });

  it("maps structured responses through configured output mode", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: false,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          return {
            executionId: "exec-1",
            promptBuildId: "build-1",
            promptVersionId: "v1",
            templateKey: "workflow.sample",
            providerKey: "stub",
            model: "stub-model",
            responseText: '{"label":"positive"}',
            latencyMs: 8,
            gatewayLatencyMs: 4,
            contextSizeBytes: 10,
            tokenUsage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
            estimatedCostUsd: 0,
            cacheHit: false,
          };
        },
      },
    });

    const mapped = services.registries.outputMappers.map(
      '{"label":"positive"}',
      createDefaultAIWorkflowNodeConfig("framework.sample", {
        outputMode: "json",
        policies: { responseFormat: "json" },
      }),
    );
    assert.equal(mapped.mode, "json");
    assert.deepEqual(mapped.value, { label: "positive" });
  });
});

describe("Runtime metadata mapping", () => {
  it("captures execution metadata for workflow variables", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: false,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          return {
            executionId: "exec-1",
            promptBuildId: "build-1",
            promptVersionId: "v1",
            templateKey: "workflow.sample",
            providerKey: "stub",
            model: "stub-model",
            responseText: "Done",
            latencyMs: 15,
            gatewayLatencyMs: 6,
            contextSizeBytes: 20,
            tokenUsage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
            estimatedCostUsd: 0.001,
            cacheHit: true,
          };
        },
      },
    });

    registerAIWorkflowNode(services.registries, sampleDefinition);
    const bridge = services.createRuntimeBridge(() => ({
      userId: "u1",
      companyId: "c1",
      isSuperAdmin: false,
      hasPermission: () => true,
    }));

    const result = await bridge.executeNode({
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "hello" },
      customer: { id: null },
      currentNode: {
        config: toAIWorkflowEngineConfig(
          createDefaultAIWorkflowNodeConfig("framework.sample", {
            promptTemplateKey: "workflow.sample",
            providerKey: "stub",
            outputVariable: "sample_output",
          }),
        ),
      },
    });

    assert.equal(result.outcome, "continue");
    const sampleOutput = (result.variables as Record<string, unknown>).sample_output as {
      mode: string;
      text: string;
    };
    assert.equal(sampleOutput.mode, "text");
    assert.equal(sampleOutput.text, "Done");
    assert.equal(
      ((result.variables as Record<string, unknown>).__aiLastExecution as { providerKey: string }).providerKey,
      "stub",
    );
  });
});
