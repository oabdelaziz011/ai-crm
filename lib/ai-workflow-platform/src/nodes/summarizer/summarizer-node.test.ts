import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultSummarizerNodeConfig,
  createAIWorkflowPlatformServices,
  createAISummarizerNode,
  resolveSummarizerInput,
  toAIWorkflowEngineConfig,
  validateSummarizerInput,
  patchSummarizerMetadata,
  buildSummarizerPromptContext,
} from "../../index.js";

describe("AI Summarizer node", () => {
  it("registers with default workflow summarizer template and output variable", () => {
    const node = createAISummarizerNode();
    const config = node.getDefaultConfig();
    assert.equal(config.nodeKey, "ai.summarizer");
    assert.equal(config.promptTemplateKey, "workflow_summarize");
    assert.equal(config.outputVariable, "summary_result");
  });

  it("validates missing input for variable and static sources", () => {
    const config = createDefaultSummarizerNodeConfig();
    assert.equal(validateSummarizerInput(config).length, 0);

    const missingVariable = patchSummarizerMetadata(createDefaultSummarizerNodeConfig(), {
      inputVariable: "",
    });
    assert.ok(validateSummarizerInput(missingVariable).some((issue) => issue.code === "missing_input_variable"));
  });

  it("builds prompt context from workflow variables and presets", () => {
    const node = createAISummarizerNode();
    const config = createDefaultSummarizerNodeConfig();
    const context = buildSummarizerPromptContext(config, {
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "Long text about quarterly revenue and customer growth." },
      customer: { id: null },
      currentNode: { config: {} },
    });

    assert.match(String((context.summary as { input: string }).input), /quarterly revenue/);
    assert.equal((context.summary as { preset: string }).preset, "medium");
    assert.equal(node.buildPromptContext(config, {
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "Hello world" },
      customer: { id: null },
      currentNode: { config: {} },
    }).summary?.input, "Hello world");
  });

  it("executes through the shared AI workflow adapter and stores metadata", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: true,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          return {
            executionId: "exec-sum-1",
            promptBuildId: "build-sum-1",
            promptVersionId: "v3",
            templateKey: "workflow_summarize",
            providerKey: "stub",
            model: "stub-model",
            responseText: "Revenue grew steadily with strong retention.",
            latencyMs: 18,
            gatewayLatencyMs: 9,
            contextSizeBytes: 120,
            tokenUsage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
            estimatedCostUsd: 0.002,
            cacheHit: false,
          };
        },
      },
    });

    const bridge = services.createRuntimeBridge(() => ({
      userId: "u1",
      companyId: "c1",
      isSuperAdmin: false,
      hasPermission: () => true,
    }));

    const config = createDefaultSummarizerNodeConfig();
    config.providerKey = "stub";
    const result = await bridge.executeNode({
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "Long quarterly report text..." },
      customer: { id: null },
      currentNode: { config: toAIWorkflowEngineConfig(config) },
    });

    assert.equal(result.outcome, "continue");
    const summary = (result.variables as Record<string, unknown>).summary_result as { mode: string; text: string };
    assert.equal(summary.mode, "text");
    assert.match(summary.text, /Revenue grew/);
    const metadata = (result.variables as Record<string, unknown>).__aiLastExecution as {
      status: string;
      promptTemplateKey: string | null;
      providerKey: string;
    };
    assert.equal(metadata.status, "success");
    assert.equal(metadata.promptTemplateKey, "workflow_summarize");
    assert.equal(metadata.providerKey, "stub");
    assert.ok(services.observability.list().some((event) => event.type === "node_completed"));
    assert.ok(services.observability.list().some((event) => event.type === "gateway_completed"));
  });

  it("resolves static input source text", () => {
    const config = patchSummarizerMetadata(createDefaultSummarizerNodeConfig(), {
      inputSource: "static",
      staticText: "Static content to summarize.",
      inputVariable: null,
    });
    assert.equal(resolveSummarizerInput(config, {}), "Static content to summarize.");
  });
});
