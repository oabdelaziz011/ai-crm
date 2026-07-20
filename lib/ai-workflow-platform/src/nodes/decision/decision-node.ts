import { BaseAIWorkflowNode } from "../base-ai-workflow-node.js";
import type { AIWorkflowRegistryBundle } from "../../registries/index.js";
import type { AIWorkflowNodeConfig, AIWorkflowNodeDefinition } from "../../types/configuration.js";
import type { AIWorkflowExecutionResult, AIWorkflowNodeOutput, AIWorkflowRuntimeMetadata } from "../../types/metadata.js";
import type { AIWorkflowPreviewResult } from "../../types/preview.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowServiceContext } from "../../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowObservabilityRecorder } from "../../observability/ai-workflow-observability.js";
import {
  AI_DECISION_NODE_KEY,
  DEFAULT_DECISION_PROMPT_TEMPLATE_KEY,
  DECISION_MODE_DISPLAY_NAMES,
} from "./constants.js";
import { createDefaultDecisionNodeConfig, readDecisionMetadata } from "./types.js";
import {
  buildDecisionOutputSchema,
  buildDecisionPromptContext,
  estimateDecisionTokenRange,
  resolveDecisionInput,
} from "./decision-presets.js";
import { validateDecisionResult } from "./result-validator.js";

export const AI_DECISION_NODE_DEFINITION: AIWorkflowNodeDefinition = {
  key: AI_DECISION_NODE_KEY,
  displayName: "AI Decision",
  description: "Classify, categorize, score, or make structured business decisions.",
  category: "understanding",
  icon: "Scale",
  version: "1.0.0",
  capabilities: ["supportsContext", "supportsJson", "usesKnowledge"],
  outputModes: ["classification", "structured", "json", "boolean", "array"],
  defaultConfig: createDefaultDecisionNodeConfig(),
};

export class AIDecisionNode extends BaseAIWorkflowNode {
  readonly definition = AI_DECISION_NODE_DEFINITION;

  override getDefaultConfig(): AIWorkflowNodeConfig {
    return createDefaultDecisionNodeConfig();
  }

  override validateConfig(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
  ): AIWorkflowValidationIssue[] {
    return registries.validation.validate(config, {
      nodeKey: this.definition.key,
      capabilities: this.definition.capabilities,
      hasProviderResolver: true,
    }).issues;
  }

  override prepareConfig(
    config: AIWorkflowNodeConfig,
    context: { automation: AIWorkflowAutomationContext; serviceContext: AIWorkflowServiceContext },
  ): AIWorkflowNodeConfig {
    const decision = readDecisionMetadata(config);
    return {
      ...this.getDefaultConfig(),
      ...config,
      nodeKey: AI_DECISION_NODE_KEY,
      promptTemplateKey: config.promptTemplateKey ?? DEFAULT_DECISION_PROMPT_TEMPLATE_KEY,
      promptTemplateType: config.promptTemplateType ?? "classification",
      outputMode: config.outputMode ?? "structured",
      outputVariable: config.outputVariable ?? this.getDefaultConfig().outputVariable,
      outputSchema: buildDecisionOutputSchema({ ...config, metadata: { ...config.metadata, decision } }),
      policies: {
        ...this.getDefaultConfig().policies,
        ...config.policies,
        responseFormat: "json",
        temperature: config.policies?.temperature ?? 0,
      },
      metadata: {
        ...config.metadata,
        decision,
        resolvedInputPreview: resolveDecisionInput(
          { ...config, metadata: { ...config.metadata, decision } },
          context.automation,
        ).slice(0, 240),
      },
    };
  }

  override buildPromptContext(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
  ): Record<string, unknown> {
    return buildDecisionPromptContext(config, context);
  }

  override onPrepared(
    record: AIWorkflowObservabilityRecorder,
    config: AIWorkflowNodeConfig,
    _context: AIWorkflowAutomationContext,
  ): void {
    const decision = readDecisionMetadata(config);
    record({
      type: "decision_started",
      nodeKey: config.nodeKey,
      metadata: {
        mode: decision.decisionMode,
        modeLabel: DECISION_MODE_DISPLAY_NAMES[decision.decisionMode],
        outcomeCount: decision.outcomes.length,
        confidenceThreshold: decision.confidenceThreshold,
      },
    });
  }

  override mapResult(result: AIWorkflowExecutionResult, config: AIWorkflowNodeConfig): AIWorkflowNodeOutput {
    const decision = readDecisionMetadata(config);
    const parsed = this.parseModelResponse(result);
    const validation = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      parsed,
    );
    return this.formatValidatedOutput(config, validation);
  }

  override enrichRuntimeMetadata(
    metadata: AIWorkflowRuntimeMetadata,
    result: AIWorkflowExecutionResult,
    output: AIWorkflowNodeOutput,
    config: AIWorkflowNodeConfig,
  ): AIWorkflowRuntimeMetadata {
    const decision = readDecisionMetadata(config);
    const parsed = this.parseModelResponse(result, output);
    const validation = validateDecisionResult(
      decision.outcomes,
      decision.confidencePolicy,
      decision.confidenceThreshold,
      parsed,
    );
    return {
      ...metadata,
      validationStatus: validation.valid ? "valid" : "invalid",
      decisionLabel: validation.value.label,
      decisionConfidence: validation.value.confidence,
      decisionScore: validation.value.score,
      decisionRequiresHumanReview: validation.requiresHumanReview,
    };
  }

  override onResultMapped(
    record: AIWorkflowObservabilityRecorder,
    result: AIWorkflowExecutionResult,
    output: AIWorkflowNodeOutput,
    config: AIWorkflowNodeConfig,
  ): void {
    const enriched = this.enrichRuntimeMetadata(result.metadata, result, output, config);
    record({
      type: "decision_validated",
      nodeKey: config.nodeKey,
      executionId: result.metadata.executionId,
      metadata: {
        validationStatus: enriched.validationStatus,
        label: enriched.decisionLabel,
        confidence: enriched.decisionConfidence,
        score: enriched.decisionScore,
        requiresHumanReview: enriched.decisionRequiresHumanReview,
      },
    });
  }

  override buildPreview(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
    workflowVariables: Record<string, unknown> = {},
  ): AIWorkflowPreviewResult {
    const base = super.buildPreview(config, registries, workflowVariables);
    const decision = readDecisionMetadata(config);
    const input = resolveDecisionInput(config, {
      company: { id: "preview" },
      flow: { id: "preview" },
      run: { id: "preview" },
      session: { id: "preview" },
      variables: workflowVariables,
      customer: { id: null },
      currentNode: { config: {} },
    });

    return {
      ...base,
      expectedOutput: "Validated decision result with label and confidence",
      estimatedTokenRange: estimateDecisionTokenRange(input, decision.outcomes.length),
      outputSchema: buildDecisionOutputSchema(config),
      nodeMetadata: {
        inputPreview: input.slice(0, 180) || null,
        decisionMode: decision.decisionMode,
        decisionModeLabel: DECISION_MODE_DISPLAY_NAMES[decision.decisionMode],
        outcomeCount: decision.outcomes.length,
        outcomes: decision.outcomes.map((outcome) => outcome.label),
        confidenceThreshold: decision.confidenceThreshold,
        confidencePolicy: decision.confidencePolicy,
        expectedOutput: {
          label: decision.outcomes[0]?.label ?? "example",
          confidence: 0.9,
        },
      },
    };
  }

  private parseModelResponse(result: AIWorkflowExecutionResult, output?: AIWorkflowNodeOutput): unknown {
    if (output?.mode === "json" || output?.mode === "structured") {
      const value = output.value;
      if (value && typeof value === "object" && "label" in value) {
        return value;
      }
      if (value && typeof value === "object" && "value" in value) {
        return (value as Record<string, unknown>).value;
      }
      return value;
    }
    if (output?.mode === "classification") {
      return { label: output.label, confidence: output.confidence };
    }
    try {
      const start = result.rawText.indexOf("{");
      const end = result.rawText.lastIndexOf("}");
      return JSON.parse(result.rawText.slice(start >= 0 ? start : 0, end > start ? end + 1 : undefined));
    } catch {
      return { label: result.rawText.trim() };
    }
  }

  private formatValidatedOutput(
    config: AIWorkflowNodeConfig,
    validation: ReturnType<typeof validateDecisionResult>,
  ): AIWorkflowNodeOutput {
    const payload = {
      label: validation.value.label,
      labels: validation.value.labels,
      confidence: validation.value.confidence,
      score: validation.value.score,
      metadata: {
        ...validation.value.metadata,
        validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings },
        usedFallback: validation.usedFallback,
        requiresHumanReview: validation.requiresHumanReview,
      },
    };

    if (config.outputMode === "classification") {
      return {
        mode: "classification",
        label: validation.value.label,
        confidence: validation.value.confidence,
      };
    }
    if (config.outputMode === "boolean") {
      const normalized = validation.value.label.toLowerCase();
      const value = ["yes", "true", "approved", "approve", "1"].includes(normalized);
      return { mode: "boolean", value };
    }
    if (config.outputMode === "json") return { mode: "json", value: payload };
    if (config.outputMode === "array") {
      return { mode: "array", value: validation.value.labels.length ? validation.value.labels : [validation.value.label] };
    }
    return { mode: "structured", value: payload };
  }
}

export function createAIDecisionNode(): AIDecisionNode {
  return new AIDecisionNode();
}
