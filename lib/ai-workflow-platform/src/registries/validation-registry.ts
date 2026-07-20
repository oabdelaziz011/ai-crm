import type { AIWorkflowNodeConfig } from "../types/configuration.js";
import type {
  AIWorkflowValidationContext,
  AIWorkflowValidationIssue,
  AIWorkflowValidationResult,
} from "../types/validation.js";
import type { AIOutputMode } from "../constants.js";

export type ValidationRule = (
  config: AIWorkflowNodeConfig,
  context: AIWorkflowValidationContext,
) => AIWorkflowValidationIssue[];

export class ValidationRegistry {
  private readonly rules = new Map<string, ValidationRule[]>();
  private readonly globalRules: ValidationRule[] = [];

  registerGlobal(rule: ValidationRule): this {
    this.globalRules.push(rule);
    return this;
  }

  register(nodeKey: string, rule: ValidationRule): this {
    const existing = this.rules.get(nodeKey) ?? [];
    existing.push(rule);
    this.rules.set(nodeKey, existing);
    return this;
  }

  validate(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowValidationContext = {},
  ): AIWorkflowValidationResult {
    const issues = [
      ...this.globalRules.flatMap((rule) => rule(config, context)),
      ...(this.rules.get(config.nodeKey) ?? []).flatMap((rule) => rule(config, context)),
    ];
    return {
      valid: issues.every((issue) => issue.severity !== "error"),
      issues,
    };
  }
}

const JSON_OUTPUT_MODES: AIOutputMode[] = ["json", "structured", "array", "classification"];

function missingPromptRule(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowValidationContext,
): AIWorkflowValidationIssue[] {
  if (context.capabilities?.includes("retrievalOnly")) return [];
  if (config.promptTemplateKey?.trim()) return [];
  return [
    {
      id: "missing-prompt",
      code: "missing_prompt",
      field: "promptTemplateKey",
      message: "Select a prompt template for this AI node.",
      severity: "error",
    },
  ];
}

function providerRule(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowValidationContext,
): AIWorkflowValidationIssue[] {
  if (context.capabilities?.includes("retrievalOnly")) return [];
  if (config.providerConnectionId || config.providerKey) return [];
  if (context.hasProviderResolver) return [];
  return [
    {
      id: "missing-provider",
      code: "missing_provider",
      field: "providerConnectionId",
      message: "Select a provider connection or default provider key.",
      severity: "error",
    },
  ];
}

function knowledgeRule(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowValidationContext,
): AIWorkflowValidationIssue[] {
  const requiresKnowledge =
    context.capabilities?.includes("retrievalOnly") || config.knowledge?.enabled === true;
  if (!requiresKnowledge) return [];
  const knowledge = config.knowledge;
  if (!knowledge) return [];
  const issues: AIWorkflowValidationIssue[] = [];
  if (!knowledge.collectionId) {
    issues.push({
      id: "missing-knowledge-collection",
      code: "missing_knowledge_collection",
      field: "knowledge.collectionId",
      message: "Knowledge is enabled but no knowledge base is selected.",
      severity: "error",
    });
  }
  if (!knowledge.embeddingConnectionId || !knowledge.vectorStoreConnectionId) {
    issues.push({
      id: "missing-knowledge-connections",
      code: "missing_knowledge_connections",
      field: "knowledge.embeddingConnectionId",
      message: "Knowledge retrieval requires embedding and vector store connections.",
      severity: "warning",
    });
  }
  return issues;
}

function outputModeRule(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  if (!JSON_OUTPUT_MODES.includes(config.outputMode)) return [];
  if (config.policies?.responseFormat === "json") return [];
  return [
    {
      id: "output-mode-policy-conflict",
      code: "output_mode_policy_conflict",
      field: "policies.responseFormat",
      message: "Structured output modes should use JSON response format.",
      severity: "warning",
    },
  ];
}

export function createDefaultValidationRegistry(): ValidationRegistry {
  return new ValidationRegistry()
    .registerGlobal(missingPromptRule)
    .registerGlobal(providerRule)
    .registerGlobal(knowledgeRule)
    .registerGlobal(outputModeRule);
}
