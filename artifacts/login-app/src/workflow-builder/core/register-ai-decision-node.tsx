import {
  AI_DECISION_NODE_DEFINITION,
  AI_DECISION_NODE_KEY,
  createDefaultDecisionNodeConfig,
  normalizeAIWorkflowNodeConfig,
  toAIWorkflowEngineConfig,
  validateDecisionInput,
  validateDecisionOutcomes,
  validateDecisionOutputVariable,
} from "@workspace/ai-workflow-platform";
import { registerWorkflowNode } from "./node-registry";
import {
  AIDecisionPropertyEditor,
  createDecisionBuilderDefaultConfig,
} from "../components/properties/ai/ai-decision-property-editor";

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

export function registerAIDecisionWorkflowNode(): void {
  registerWorkflowNode({
    id: "ai_decision",
    displayName: AI_DECISION_NODE_DEFINITION.displayName,
    description: AI_DECISION_NODE_DEFINITION.description,
    category: "ai",
    engineType: "action",
    icon: "Scale",
    accentClass: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30",
    searchKeywords: ["ai", "decision", "classify", "route", "intent", "sentiment", "approval"],
    defaultConfig: createDecisionBuilderDefaultConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: AIDecisionPropertyEditor,
    validate: (config, nodeId) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_DECISION_NODE_KEY)
          : createDefaultDecisionNodeConfig();
      const issues = [
        ...validateDecisionOutcomes(aiConfig),
        ...validateDecisionInput(aiConfig),
        ...validateDecisionOutputVariable(aiConfig),
      ];
      if (!aiConfig.promptTemplateKey?.trim()) {
        issues.push({
          id: "missing-prompt",
          code: "missing_prompt",
          field: "promptTemplateKey",
          message: "Select a prompt template for the AI Decision node.",
          severity: "error",
        });
      }
      return mapValidationIssues(nodeId, issues);
    },
    toEngineConfig: (config) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_DECISION_NODE_KEY)
          : createDefaultDecisionNodeConfig();
      return {
        builderType: "ai_decision",
        ...toAIWorkflowEngineConfig(aiConfig),
      };
    },
    fromEngineConfig: matchBuilderType("ai_decision"),
  });
}
