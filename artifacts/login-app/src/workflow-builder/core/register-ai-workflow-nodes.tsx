import {
  AI_SUMMARIZER_NODE_DEFINITION,
  AI_SUMMARIZER_NODE_KEY,
  createDefaultSummarizerNodeConfig,
  normalizeAIWorkflowNodeConfig,
  toAIWorkflowEngineConfig,
} from "@workspace/ai-workflow-platform";
import { registerWorkflowNode } from "./node-registry";
import {
  AISummarizerPropertyEditor,
  createSummarizerBuilderDefaultConfig,
} from "../components/properties/ai/ai-summarizer-property-editor";
import {
  validateSummarizerInput,
  validateSummarizerOutputVariable,
} from "@workspace/ai-workflow-platform";

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

let registered = false;

export function registerAIWorkflowNodes(): void {
  if (registered) return;
  registered = true;

  registerWorkflowNode({
    id: "ai_summarizer",
    displayName: AI_SUMMARIZER_NODE_DEFINITION.displayName,
    description: AI_SUMMARIZER_NODE_DEFINITION.description,
    category: "ai",
    engineType: "action",
    icon: "Sparkles",
    accentClass: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/30",
    searchKeywords: ["ai", "summarize", "summary", "text", "llm"],
    defaultConfig: createSummarizerBuilderDefaultConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: AISummarizerPropertyEditor,
    validate: (config, nodeId) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_SUMMARIZER_NODE_KEY)
          : createDefaultSummarizerNodeConfig();
      const issues = [
        ...validateSummarizerInput(aiConfig),
        ...validateSummarizerOutputVariable(aiConfig),
      ];
      if (!aiConfig.promptTemplateKey?.trim()) {
        issues.push({
          id: "missing-prompt",
          code: "missing_prompt",
          field: "promptTemplateKey",
          message: "Select a prompt template for the AI Summarizer.",
          severity: "error",
        });
      }
      return mapValidationIssues(nodeId, issues);
    },
    toEngineConfig: (config) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_SUMMARIZER_NODE_KEY)
          : createDefaultSummarizerNodeConfig();
      return {
        builderType: "ai_summarizer",
        ...toAIWorkflowEngineConfig(aiConfig),
      };
    },
    fromEngineConfig: matchBuilderType("ai_summarizer"),
  });
}
