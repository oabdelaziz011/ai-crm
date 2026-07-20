import {
  AI_EXTRACT_NODE_DEFINITION,
  AI_EXTRACT_NODE_KEY,
  createDefaultExtractNodeConfig,
  normalizeAIWorkflowNodeConfig,
  toAIWorkflowEngineConfig,
  validateExtractInput,
  validateExtractOutputVariable,
  validateExtractionSchema,
} from "@workspace/ai-workflow-platform";
import { registerWorkflowNode } from "./node-registry";
import { AIExtractPropertyEditor, createExtractBuilderDefaultConfig } from "../components/properties/ai/ai-extract-property-editor";

function matchBuilderType(builderType: string) {
  return (_engineType: unknown, config: Record<string, unknown>) =>
    config.builderType === builderType ? { ...config } : null;
}

function mapValidationIssues(
  nodeId: string,
  issues: Array<{ id: string; message: string; severity: "error" | "warning" }>,
) {
  return issues.map((issue) => ({
    id: `${nodeId}-${issue.id}`,
    nodeId,
    message: issue.message,
    severity: issue.severity,
  }));
}

export function registerAIExtractWorkflowNode(): void {
  registerWorkflowNode({
    id: "ai_extract",
    displayName: AI_EXTRACT_NODE_DEFINITION.displayName,
    description: AI_EXTRACT_NODE_DEFINITION.description,
    category: "ai",
    engineType: "action",
    icon: "ScanSearch",
    accentClass: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    searchKeywords: ["ai", "extract", "structured", "json", "parse", "fields"],
    defaultConfig: createExtractBuilderDefaultConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: AIExtractPropertyEditor,
    validate: (config, nodeId) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_EXTRACT_NODE_KEY)
          : createDefaultExtractNodeConfig();
      const issues = [
        ...validateExtractionSchema(aiConfig),
        ...validateExtractInput(aiConfig),
        ...validateExtractOutputVariable(aiConfig),
      ];
      if (!aiConfig.promptTemplateKey?.trim()) {
        issues.push({
          id: "missing-prompt",
          code: "missing_prompt",
          field: "promptTemplateKey",
          message: "Select a prompt template for the AI Extract node.",
          severity: "error",
        });
      }
      return mapValidationIssues(nodeId, issues);
    },
    toEngineConfig: (config) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_EXTRACT_NODE_KEY)
          : createDefaultExtractNodeConfig();
      return {
        builderType: "ai_extract",
        ...toAIWorkflowEngineConfig(aiConfig),
      };
    },
    fromEngineConfig: matchBuilderType("ai_extract"),
  });
}
