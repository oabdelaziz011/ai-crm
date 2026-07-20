import {
  AI_KNOWLEDGE_SEARCH_NODE_DEFINITION,
  AI_KNOWLEDGE_SEARCH_NODE_KEY,
  createDefaultKnowledgeSearchNodeConfig,
  normalizeAIWorkflowNodeConfig,
  toAIWorkflowEngineConfig,
  validateKnowledgeSearchOutputVariable,
  validateKnowledgeSearchQuery,
  validateKnowledgeSearchRetrievalConfig,
} from "@workspace/ai-workflow-platform";
import { registerWorkflowNode } from "./node-registry";
import {
  AIKnowledgeSearchPropertyEditor,
  createKnowledgeSearchBuilderDefaultConfig,
} from "../components/properties/ai/ai-knowledge-search-property-editor";

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

export function registerAIKnowledgeSearchWorkflowNode(): void {
  registerWorkflowNode({
    id: "ai_knowledge_search",
    displayName: AI_KNOWLEDGE_SEARCH_NODE_DEFINITION.displayName,
    description: AI_KNOWLEDGE_SEARCH_NODE_DEFINITION.description,
    category: "ai",
    engineType: "action",
    icon: "BookOpen",
    accentClass: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
    searchKeywords: ["ai", "knowledge", "search", "rag", "retrieval", "context", "documents"],
    defaultConfig: createKnowledgeSearchBuilderDefaultConfig(),
    allowIncoming: true,
    allowOutgoing: true,
    PropertyEditor: AIKnowledgeSearchPropertyEditor,
    validate: (config, nodeId) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_KNOWLEDGE_SEARCH_NODE_KEY)
          : createDefaultKnowledgeSearchNodeConfig();
      const issues = [
        ...validateKnowledgeSearchQuery(aiConfig),
        ...validateKnowledgeSearchRetrievalConfig(aiConfig),
        ...validateKnowledgeSearchOutputVariable(aiConfig),
      ];
      return mapValidationIssues(nodeId, issues);
    },
    toEngineConfig: (config) => {
      const aiConfig =
        config.aiConfig && typeof config.aiConfig === "object"
          ? normalizeAIWorkflowNodeConfig(config.aiConfig as Record<string, unknown>, AI_KNOWLEDGE_SEARCH_NODE_KEY)
          : createDefaultKnowledgeSearchNodeConfig();
      return {
        builderType: "ai_knowledge_search",
        ...toAIWorkflowEngineConfig(aiConfig),
      };
    },
    fromEngineConfig: matchBuilderType("ai_knowledge_search"),
  });
}
