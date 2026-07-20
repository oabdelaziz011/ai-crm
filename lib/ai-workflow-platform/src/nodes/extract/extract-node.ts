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
  AI_EXTRACT_NODE_KEY,
  DEFAULT_EXTRACT_PROMPT_TEMPLATE_KEY,
} from "./constants.js";
import { createDefaultExtractNodeConfig, readExtractMetadata } from "./types.js";
import {
  buildExtractPromptContext,
  estimateExtractTokenRange,
  resolveExtractInput,
} from "./extract-presets.js";
import { schemaToJsonSchema, validateExtractionResult } from "./result-validator.js";

export const AI_EXTRACT_NODE_DEFINITION: AIWorkflowNodeDefinition = {
  key: AI_EXTRACT_NODE_KEY,
  displayName: "AI Extract",
  description: "Extract structured business data from text.",
  category: "understanding",
  icon: "ScanSearch",
  version: "1.0.0",
  capabilities: ["supportsContext", "supportsJson", "usesKnowledge"],
  outputModes: ["structured", "json", "array", "text"],
  defaultConfig: createDefaultExtractNodeConfig(),
};

export class AIExtractNode extends BaseAIWorkflowNode {
  readonly definition = AI_EXTRACT_NODE_DEFINITION;

  override getDefaultConfig(): AIWorkflowNodeConfig {
    return createDefaultExtractNodeConfig();
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
    const extract = readExtractMetadata(config);
    return {
      ...this.getDefaultConfig(),
      ...config,
      nodeKey: AI_EXTRACT_NODE_KEY,
      promptTemplateKey: config.promptTemplateKey ?? DEFAULT_EXTRACT_PROMPT_TEMPLATE_KEY,
      promptTemplateType: config.promptTemplateType ?? "extraction",
      outputMode: config.outputMode ?? "structured",
      outputVariable: config.outputVariable ?? this.getDefaultConfig().outputVariable,
      outputSchema: schemaToJsonSchema(extract.schema),
      policies: {
        ...this.getDefaultConfig().policies,
        ...config.policies,
        responseFormat: "json",
        temperature: config.policies?.temperature ?? 0,
      },
      metadata: {
        ...config.metadata,
        extract,
        resolvedInputPreview: resolveExtractInput(
          { ...config, metadata: { ...config.metadata, extract } },
          context.automation,
        ).slice(0, 240),
      },
    };
  }

  override buildPromptContext(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
  ): Record<string, unknown> {
    return buildExtractPromptContext(config, context);
  }

  override onPrepared(
    record: AIWorkflowObservabilityRecorder,
    config: AIWorkflowNodeConfig,
    _context: AIWorkflowAutomationContext,
  ): void {
    const extract = readExtractMetadata(config);
    record({
      type: "schema_built",
      nodeKey: config.nodeKey,
      metadata: {
        fieldCount: extract.schema.fields.length,
        schema: schemaToJsonSchema(extract.schema),
      },
    });
  }

  override mapResult(result: AIWorkflowExecutionResult, config: AIWorkflowNodeConfig): AIWorkflowNodeOutput {
    const extract = readExtractMetadata(config);
    const parsed = this.parseModelResponse(result);
    const validation = validateExtractionResult(extract.schema, parsed, extract.coercionPolicy);
    return this.formatValidatedOutput(config, validation);
  }

  override enrichRuntimeMetadata(
    metadata: AIWorkflowRuntimeMetadata,
    result: AIWorkflowExecutionResult,
    output: AIWorkflowNodeOutput,
    config: AIWorkflowNodeConfig,
  ): AIWorkflowRuntimeMetadata {
    const extract = readExtractMetadata(config);
    const parsed = this.parseModelResponse(result, output);
    const validation = validateExtractionResult(extract.schema, parsed, extract.coercionPolicy);
    return {
      ...metadata,
      validationStatus: validation.valid ? "valid" : "invalid",
      extractionConfidence: validation.confidence,
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
      type: "extraction_validated",
      nodeKey: config.nodeKey,
      executionId: result.metadata.executionId,
      metadata: {
        validationStatus: enriched.validationStatus,
        confidence: enriched.extractionConfidence,
      },
    });
  }

  override buildPreview(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
    workflowVariables: Record<string, unknown> = {},
  ): AIWorkflowPreviewResult {
    const base = super.buildPreview(config, registries, workflowVariables);
    const extract = readExtractMetadata(config);
    const input = resolveExtractInput(config, {
      company: { id: "preview" },
      flow: { id: "preview" },
      run: { id: "preview" },
      session: { id: "preview" },
      variables: workflowVariables,
      customer: { id: null },
      currentNode: { config: {} },
    });
    const schema = schemaToJsonSchema(extract.schema);

    return {
      ...base,
      expectedOutput: "Validated structured extraction object",
      estimatedTokenRange: estimateExtractTokenRange(input, extract.schema.fields.length),
      outputSchema: schema,
      nodeMetadata: {
        inputPreview: input.slice(0, 180) || null,
        fieldCount: extract.schema.fields.length,
        inputSource: extract.inputSource,
        coercionPolicy: extract.coercionPolicy,
        expectedJson: schema,
      },
    };
  }

  private parseModelResponse(result: AIWorkflowExecutionResult, output?: AIWorkflowNodeOutput): unknown {
    if (output?.mode === "json" || output?.mode === "structured") {
      return output.value;
    }
    try {
      const start = result.rawText.indexOf("{");
      const end = result.rawText.lastIndexOf("}");
      return JSON.parse(result.rawText.slice(start >= 0 ? start : 0, end > start ? end + 1 : undefined));
    } catch {
      return { raw: result.rawText };
    }
  }

  private formatValidatedOutput(
    config: AIWorkflowNodeConfig,
    validation: ReturnType<typeof validateExtractionResult>,
  ): AIWorkflowNodeOutput {
    const payload = {
      data: validation.value,
      confidence: validation.confidence,
      validation: { valid: validation.valid, errors: validation.errors },
    };

    if (config.outputMode === "json") return { mode: "json", value: payload };
    if (config.outputMode === "array") return { mode: "array", value: [validation.value] };
    if (config.outputMode === "text") {
      return { mode: "text", text: JSON.stringify(validation.value, null, 2) };
    }
    return { mode: "structured", value: payload };
  }
}

export function createAIExtractNode(): AIExtractNode {
  return new AIExtractNode();
}
