import { BaseAIWorkflowNode } from "../base-ai-workflow-node.js";
import type { AIWorkflowRegistryBundle } from "../../registries/index.js";
import type { AIWorkflowNodeConfig, AIWorkflowNodeDefinition } from "../../types/configuration.js";
import type { AIWorkflowPreviewResult } from "../../types/preview.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowServiceContext } from "../../adapters/ai-workflow-execution-adapter.js";
import {
  AI_SUMMARIZER_NODE_KEY,
  DEFAULT_SUMMARIZER_PROMPT_TEMPLATE_KEY,
  SUMMARY_PRESET_DEFINITIONS,
} from "./constants.js";
import { createDefaultSummarizerNodeConfig, readSummarizerMetadata } from "./types.js";
import {
  buildSummarizerPromptContext,
  estimateSummarizerTokenRange,
  resolveSummarizerInput,
} from "./summarizer-presets.js";

export const AI_SUMMARIZER_NODE_DEFINITION: AIWorkflowNodeDefinition = {
  key: AI_SUMMARIZER_NODE_KEY,
  displayName: "AI Summarizer",
  description: "Summarize long text using enterprise AI runtime.",
  category: "transformation",
  icon: "Sparkles",
  version: "1.0.0",
  capabilities: ["supportsContext", "supportsJson", "usesKnowledge"],
  outputModes: ["text", "json", "structured"],
  defaultConfig: createDefaultSummarizerNodeConfig(),
};

export class AISummarizerNode extends BaseAIWorkflowNode {
  readonly definition = AI_SUMMARIZER_NODE_DEFINITION;

  override getDefaultConfig(): AIWorkflowNodeConfig {
    return createDefaultSummarizerNodeConfig();
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
    const merged = {
      ...this.getDefaultConfig(),
      ...config,
      nodeKey: AI_SUMMARIZER_NODE_KEY,
      promptTemplateKey: config.promptTemplateKey ?? DEFAULT_SUMMARIZER_PROMPT_TEMPLATE_KEY,
      promptTemplateType: config.promptTemplateType ?? "summarization",
      outputMode: config.outputMode ?? "text",
      outputVariable: config.outputVariable ?? this.getDefaultConfig().outputVariable,
    };
    const input = resolveSummarizerInput(merged, context.automation.variables);
    const preset = readSummarizerMetadata(merged).summaryPreset;
    const presetDefinition = SUMMARY_PRESET_DEFINITIONS[preset];
    return {
      ...merged,
      policies: {
        ...merged.policies,
        maxTokens: merged.policies?.maxTokens ?? presetDefinition.estimatedOutputTokens + 256,
        responseFormat: merged.outputMode === "text" ? "text" : "json",
      },
      metadata: {
        ...merged.metadata,
        summarizer: readSummarizerMetadata(merged),
        resolvedInputPreview: input.slice(0, 240),
      },
    };
  }

  override buildPromptContext(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
  ): Record<string, unknown> {
    return buildSummarizerPromptContext(config, context);
  }

  override buildPreview(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
    workflowVariables: Record<string, unknown> = {},
  ): AIWorkflowPreviewResult {
    const base = super.buildPreview(config, registries, workflowVariables);
    const input = resolveSummarizerInput(config, workflowVariables);
    const tokenRange = estimateSummarizerTokenRange(config, input);
    const summarizer = readSummarizerMetadata(config);

    return {
      ...base,
      expectedOutput:
        config.outputMode === "text"
          ? `${SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].label} text summary`
          : `Structured ${config.outputMode} summary`,
      estimatedTokenRange: tokenRange,
      outputSchema:
        config.outputMode === "text"
          ? null
          : config.outputSchema ?? { type: "object", properties: { summary: { type: "string" } } },
      nodeMetadata: {
        inputPreview: input.slice(0, 180) || null,
        summaryPreset: summarizer.summaryPreset,
        summaryStyle: summarizer.summaryStyle ?? SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].style,
        tone: summarizer.tone ?? SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].tone,
        language: summarizer.language ?? "English",
        bulletMode: summarizer.bulletMode || SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset].bulletMode,
      },
    };
  }
}

export function createAISummarizerNode(): AISummarizerNode {
  return new AISummarizerNode();
}
