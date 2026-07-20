import type { BaseAIWorkflowNode } from "./nodes/base-ai-workflow-node.js";
import { createAIExtractNode } from "./nodes/extract/extract-node.js";
import { registerExtractValidationRules } from "./nodes/extract/schema-validation.js";
import { createAIDecisionNode } from "./nodes/decision/decision-node.js";
import { registerDecisionValidationRules } from "./nodes/decision/decision-validation.js";
import { createAIKnowledgeSearchNode } from "./nodes/knowledge-search/knowledge-search-node.js";
import { registerKnowledgeSearchValidationRules } from "./nodes/knowledge-search/knowledge-search-validation.js";
import { createAISummarizerNode } from "./nodes/summarizer/summarizer-node.js";
import { registerSummarizerValidationRules } from "./nodes/summarizer/summarizer-validation.js";
import type { AIWorkflowRegistryBundle } from "./registries/index.js";
import { registerAIWorkflowNode } from "./registries/index.js";

export function createBuiltInAIWorkflowNodes(): BaseAIWorkflowNode[] {
  return [createAISummarizerNode(), createAIExtractNode(), createAIDecisionNode(), createAIKnowledgeSearchNode()];
}

export function registerBuiltInAIWorkflowNodes(registries: AIWorkflowRegistryBundle): Map<string, BaseAIWorkflowNode> {
  const nodes = new Map<string, BaseAIWorkflowNode>();
  for (const node of createBuiltInAIWorkflowNodes()) {
    registerAIWorkflowNode(registries, node.definition);
    nodes.set(node.definition.key, node);
  }

  registerSummarizerValidationRules((nodeKey, rule) => {
    registries.validation.register(nodeKey, rule);
  });
  registerExtractValidationRules((nodeKey, rule) => {
    registries.validation.register(nodeKey, rule);
  });
  registerDecisionValidationRules((nodeKey, rule) => {
    registries.validation.register(nodeKey, rule);
  });
  registerKnowledgeSearchValidationRules((nodeKey, rule) => {
    registries.validation.register(nodeKey, rule);
  });

  return nodes;
}
