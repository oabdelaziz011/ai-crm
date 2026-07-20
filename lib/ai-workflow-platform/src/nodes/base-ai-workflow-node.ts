import type { AIWorkflowExecutionAdapter } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowServiceContext } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowRegistryBundle } from "../registries/index.js";
import type {
  AIWorkflowNodeConfig,
  AIWorkflowNodeDefinition,
} from "../types/configuration.js";
import { createDefaultAIWorkflowNodeConfig } from "../types/configuration.js";
import type { AIWorkflowExecutionResult, AIWorkflowNodeOutput } from "../types/metadata.js";
import type { AIWorkflowPreviewResult } from "../types/preview.js";
import type { AIWorkflowValidationIssue } from "../types/validation.js";
import type { AIWorkflowAutomationContext } from "../types/automation-context.js";
import type { AIWorkflowObservabilityRecorder } from "../observability/ai-workflow-observability.js";

export abstract class BaseAIWorkflowNode {
  abstract readonly definition: AIWorkflowNodeDefinition;

  getDefaultConfig(): AIWorkflowNodeConfig {
    return createDefaultAIWorkflowNodeConfig(this.definition.key, this.definition.defaultConfig);
  }

  validateConfig(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
  ): AIWorkflowValidationIssue[] {
    return registries.validation.validate(config, {
      nodeKey: this.definition.key,
      capabilities: this.definition.capabilities,
    }).issues;
  }

  prepareConfig(
    config: AIWorkflowNodeConfig,
    _context: { automation: AIWorkflowAutomationContext; serviceContext: import("../adapters/ai-workflow-execution-adapter.js").AIWorkflowServiceContext },
  ): AIWorkflowNodeConfig {
    return {
      ...this.getDefaultConfig(),
      ...config,
      nodeKey: this.definition.key,
    };
  }

  buildPreview(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
    workflowVariables: Record<string, unknown> = {},
  ): AIWorkflowPreviewResult {
    const validationIssues = this.validateConfig(config, registries);
    return {
      configuration: config,
      promptTemplateKey: config.promptTemplateKey ?? null,
      outputMode: config.outputMode,
      outputSchema: config.outputSchema ?? null,
      knowledgeEnabled: config.knowledge?.enabled === true,
      knowledgeSummary: config.knowledge?.enabled
        ? `Collection ${config.knowledge.collectionId ?? "default"} · max ${config.knowledge.maxChunks ?? 8} chunks`
        : null,
      runtimeMetadata: {
        estimatedTokens: config.policies?.maxTokens ?? null,
        providerKey: config.providerKey ?? null,
        model: config.model ?? null,
        streaming: config.policies?.streaming === true,
      },
      validationIssues,
    };
  }

  mapResult(result: AIWorkflowExecutionResult, config: AIWorkflowNodeConfig): AIWorkflowNodeOutput {
    return result.mapped;
  }

  buildPromptContext(
    _config: AIWorkflowNodeConfig,
    _context: AIWorkflowAutomationContext,
  ): Record<string, unknown> {
    return {};
  }

  buildRetrievalQuery(_config: AIWorkflowNodeConfig, _context: AIWorkflowAutomationContext): string {
    return "";
  }

  buildKnowledgeRetrievalInput(
    _config: AIWorkflowNodeConfig,
    _context: AIWorkflowAutomationContext,
    question: string,
  ): import("../adapters/knowledge-retrieval-port.js").AIWorkflowKnowledgeRetrievalInput {
    throw new Error("Retrieval-only node must implement buildKnowledgeRetrievalInput.");
  }

  mapRetrievalResult(
    _result: import("../adapters/knowledge-retrieval-port.js").AIWorkflowKnowledgeRetrievalResult,
    _config: AIWorkflowNodeConfig,
  ): AIWorkflowNodeOutput {
    throw new Error("Retrieval-only node must implement mapRetrievalResult.");
  }

  enrichRetrievalMetadata(
    metadata: import("../types/metadata.js").AIWorkflowRuntimeMetadata,
    _result: import("../adapters/knowledge-retrieval-port.js").AIWorkflowKnowledgeRetrievalResult,
    _output: AIWorkflowNodeOutput,
    _config: AIWorkflowNodeConfig,
  ): import("../types/metadata.js").AIWorkflowRuntimeMetadata {
    return metadata;
  }

  onRetrievalCompleted(
    _record: AIWorkflowObservabilityRecorder,
    _result: import("../adapters/knowledge-retrieval-port.js").AIWorkflowKnowledgeRetrievalResult,
    _config: AIWorkflowNodeConfig,
  ): void {
    /* optional node hook */
  }

  onPrepared(
    _record: AIWorkflowObservabilityRecorder,
    _config: AIWorkflowNodeConfig,
    _context: AIWorkflowAutomationContext,
  ): void {
    /* optional node hook */
  }

  enrichRuntimeMetadata(
    metadata: import("../types/metadata.js").AIWorkflowRuntimeMetadata,
    _result: AIWorkflowExecutionResult,
    _output: AIWorkflowNodeOutput,
    _config: AIWorkflowNodeConfig,
  ): import("../types/metadata.js").AIWorkflowRuntimeMetadata {
    return metadata;
  }

  onResultMapped(
    _record: AIWorkflowObservabilityRecorder,
    _result: AIWorkflowExecutionResult,
    _output: AIWorkflowNodeOutput,
    _config: AIWorkflowNodeConfig,
  ): void {
    /* optional node hook */
  }

  async previewExecute(
    adapter: AIWorkflowExecutionAdapter,
    ctx: AIWorkflowServiceContext,
    input: Parameters<AIWorkflowExecutionAdapter["buildPrompt"]>[1],
  ) {
    return adapter.buildPrompt(ctx, input);
  }
}

export function createBaseAIWorkflowNode(
  definition: AIWorkflowNodeDefinition,
  hooks?: {
    prepareConfig?: BaseAIWorkflowNode["prepareConfig"];
    mapResult?: BaseAIWorkflowNode["mapResult"];
  },
): BaseAIWorkflowNode {
  return new (class extends BaseAIWorkflowNode {
    readonly definition = definition;

    override prepareConfig(config: AIWorkflowNodeConfig, context: { automation: AIWorkflowAutomationContext; serviceContext: import("../adapters/ai-workflow-execution-adapter.js").AIWorkflowServiceContext }) {
      return hooks?.prepareConfig?.(config, context) ?? super.prepareConfig(config, context);
    }

    override mapResult(result: AIWorkflowExecutionResult, config: AIWorkflowNodeConfig) {
      return hooks?.mapResult?.(result, config) ?? super.mapResult(result, config);
    }
  })();
}
