import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAIWorkflowPlatformServices,
  createDefaultDecisionNodeConfig,
  patchDecisionMetadata,
  toAIWorkflowEngineConfig,
  validateDecisionInput,
  validateDecisionOutcomes,
  validateDecisionResult,
} from "../../index.js";

describe("Decision configuration validation", () => {
  it("requires at least one outcome for classification modes", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), { outcomes: [] });
    assert.ok(validateDecisionOutcomes(config).some((issue) => issue.code === "missing_decision_outcomes"));
  });

  it("validates duplicate outcome labels", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
      outcomes: [
        { id: "a", label: "sales", description: "Sales" },
        { id: "b", label: "sales", description: "Duplicate" },
      ],
    });
    assert.ok(validateDecisionOutcomes(config).some((issue) => issue.code === "duplicate_outcome_label"));
  });

  it("requires input variable when using variable source", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), { inputVariable: "" });
    assert.ok(validateDecisionInput(config).some((issue) => issue.code === "missing_input_variable"));
  });
});

describe("Decision result validation", () => {
  it("validates allowed labels and confidence", () => {
    const config = createDefaultDecisionNodeConfig();
    const decision = config.metadata!.decision!;
    const result = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      { label: "sales", confidence: 0.91, reasoning: "Pricing question" },
    );
    assert.equal(result.valid, true);
    assert.equal(result.value.label, "sales");
    assert.equal(result.value.confidence, 0.91);
  });

  it("applies fallback outcome for unknown labels", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
      fallbackOutcomeId: "intent-other",
      confidencePolicy: {
        minimumConfidence: 0.7,
        fallbackOutcomeId: "intent-other",
        retryOnce: false,
        requireHumanReview: false,
        emitWarning: true,
        continueWorkflow: true,
      },
    });
    const decision = config.metadata!.decision!;
    const result = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      { label: "unknown_label", confidence: 0.4 },
    );
    assert.equal(result.value.label, "other");
    assert.equal(result.usedFallback, true);
    assert.ok(result.warnings.length > 0);
  });

  it("does not treat missing confidence as zero when label is valid", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
      fallbackOutcomeId: "intent-other",
      confidencePolicy: {
        minimumConfidence: 0.7,
        fallbackOutcomeId: "intent-other",
        retryOnce: false,
        requireHumanReview: false,
        emitWarning: true,
        continueWorkflow: true,
      },
    });
    const decision = config.metadata!.decision!;
    const result = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      { label: "billing", reasoning: "Price question" },
    );
    assert.equal(result.value.label, "billing");
    assert.equal(result.usedFallback, false);
  });

  it("matches outcomes by id and Arabic pricing examples", () => {
    const config = patchDecisionMetadata(createDefaultDecisionNodeConfig(), {
      outcomes: [
        {
          id: "pricing",
          label: "pricing",
          description: "Ask about prices or cost",
          examples: ["كام السعر", "اسعار وتكلفة"],
        },
        { id: "other", label: "other", description: "Other" },
      ],
      fallbackOutcomeId: "other",
      confidencePolicy: {
        minimumConfidence: 0.5,
        fallbackOutcomeId: "other",
        retryOnce: false,
        requireHumanReview: false,
        emitWarning: true,
        continueWorkflow: true,
      },
    });
    const decision = config.metadata!.decision!;

    const byId = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      { label: "pricing", confidence: 0.9 },
    );
    assert.equal(byId.value.label, "pricing");
    assert.equal(byId.usedFallback, false);

    const byExample = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      { label: "عايز اسعار وتكلفة", confidence: 0.88 },
    );
    assert.equal(byExample.value.label, "pricing");
    assert.equal(byExample.usedFallback, false);
  });
});

describe("AI Decision node execution", () => {
  it("executes through the shared framework and returns validated decision output", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: true,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          return {
            executionId: "exec-decision-1",
            promptBuildId: "build-decision-1",
            promptVersionId: "v3",
            templateKey: "workflow_decision",
            providerKey: "stub",
            model: "stub-model",
            responseText: JSON.stringify({
              label: "sales",
              labels: ["sales"],
              confidence: 0.94,
              score: null,
              reasoning: "Customer asked about pricing",
              metadata: {},
            }),
            latencyMs: 18,
            gatewayLatencyMs: 9,
            contextSizeBytes: 140,
            tokenUsage: { prompt_tokens: 70, completion_tokens: 20, total_tokens: 90 },
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

    const config = createDefaultDecisionNodeConfig();
    config.providerKey = "stub";
    const result = await bridge.executeNode({
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "How much does your enterprise plan cost?" },
      customer: { id: null },
      currentNode: { config: toAIWorkflowEngineConfig(config) },
    });

    assert.equal(result.outcome, "continue");
    const decisionResult = (result.variables as Record<string, unknown>).decision_result as {
      mode: string;
      value: { label: string; confidence: number };
    };
    assert.equal(decisionResult.mode, "structured");
    assert.equal(decisionResult.value.label, "sales");
    assert.equal(decisionResult.value.confidence, 0.94);

    const metadata = (result.variables as Record<string, unknown>).__aiLastExecution as {
      validationStatus: string;
      decisionLabel: string;
      decisionConfidence: number;
    };
    assert.equal(metadata.validationStatus, "valid");
    assert.equal(metadata.decisionLabel, "sales");
    assert.equal(metadata.decisionConfidence, 0.94);
    assert.ok(services.observability.list().some((event) => event.type === "decision_started"));
    assert.ok(services.observability.list().some((event) => event.type === "decision_validated"));
  });
});
