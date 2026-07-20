import type { AIWorkflowRegistryBundle } from "../registries/index.js";
import type { AIWorkflowNodeConfig } from "../types/configuration.js";
import type { AIWorkflowPreviewInput, AIWorkflowPreviewResult } from "../types/preview.js";
import type { AIWorkflowValidationContext, AIWorkflowValidationResult } from "../types/validation.js";
import type { BaseAIWorkflowNode } from "../nodes/base-ai-workflow-node.js";

export class AIWorkflowPreviewService {
  constructor(
    private readonly registries: AIWorkflowRegistryBundle,
    private readonly nodes?: Map<string, BaseAIWorkflowNode>,
  ) {}

  preview(input: AIWorkflowPreviewInput): AIWorkflowPreviewResult {
    const config = input.config;
    const node = this.nodes?.get(config.nodeKey);
    if (node) {
      return node.buildPreview(config, this.registries, input.workflowVariables ?? {});
    }

    const validation = this.registries.validation.validate(config, {
      nodeKey: config.nodeKey,
      capabilities: this.registries.nodes.has(config.nodeKey)
        ? this.registries.nodes.get(config.nodeKey).capabilities
        : [],
    });

    return {
      configuration: config,
      promptTemplateKey: config.promptTemplateKey ?? null,
      outputMode: config.outputMode,
      outputSchema: config.outputSchema ?? null,
      knowledgeEnabled: config.knowledge?.enabled === true,
      knowledgeSummary: config.knowledge?.enabled
        ? this.describeKnowledge(config)
        : null,
      runtimeMetadata: {
        estimatedTokens: config.policies?.maxTokens ?? null,
        providerKey: config.providerKey ?? null,
        model: config.model ?? null,
        streaming: config.policies?.streaming === true,
      },
      validationIssues: validation.issues,
    };
  }

  validate(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowValidationContext = {},
  ): AIWorkflowValidationResult {
    const node = this.nodes?.get(config.nodeKey);
    if (node) {
      const issues = node.validateConfig(config, this.registries);
      return {
        valid: issues.every((issue) => issue.severity !== "error"),
        issues,
      };
    }
    return this.registries.validation.validate(config, context);
  }

  private describeKnowledge(config: AIWorkflowNodeConfig): string {
    const knowledge = config.knowledge;
    if (!knowledge) return "Knowledge enabled";
    const parts = [
      knowledge.collectionId ? `collection ${knowledge.collectionId}` : "default collection",
      `max ${knowledge.maxChunks ?? 8} chunks`,
    ];
    if (knowledge.queryTemplate) parts.push(`query "${knowledge.queryTemplate}"`);
    return parts.join(" · ");
  }
}

export class AIWorkflowValidator {
  constructor(
    private readonly registries: AIWorkflowRegistryBundle,
    private readonly nodes?: Map<string, BaseAIWorkflowNode>,
  ) {}

  validate(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowValidationContext = {},
  ): AIWorkflowValidationResult {
    const preview = new AIWorkflowPreviewService(this.registries, this.nodes);
    return preview.validate(config, context);
  }
}
