import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import { readKnowledgeSearchMetadata } from "./types.js";

export function validateKnowledgeSearchQuery(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const search = readKnowledgeSearchMetadata(config);
  if (search.inputSource === "conversation_message") return [];
  if (search.inputSource === "custom_query") {
    if (config.knowledge?.queryTemplate?.trim() || search.staticQuery?.trim()) return [];
    return [
      {
        id: "missing-custom-query",
        code: "missing_search_query",
        field: "metadata.knowledgeSearch.staticQuery",
        message: "Enter a custom search query or configure a query template.",
        severity: "error",
      },
    ];
  }
  if (search.inputSource === "static") {
    if (search.staticQuery?.trim()) return [];
    return [
      {
        id: "missing-static-query",
        code: "missing_search_query",
        field: "metadata.knowledgeSearch.staticQuery",
        message: "Enter static search text or choose another query source.",
        severity: "error",
      },
    ];
  }
  if (["decision_output", "extract_output", "summarizer_output"].includes(search.inputSource)) {
    return [];
  }
  if (search.inputSource === "variable") {
    if (search.inputVariable?.trim()) return [];
    return [
      {
        id: "missing-input-variable",
        code: "missing_input_variable",
        field: "metadata.knowledgeSearch.inputVariable",
        message: "Select a workflow variable containing the search query.",
        severity: "error",
      },
    ];
  }
  return [];
}

export function validateKnowledgeSearchRetrievalConfig(
  config: AIWorkflowNodeConfig,
): AIWorkflowValidationIssue[] {
  const search = readKnowledgeSearchMetadata(config);
  const issues: AIWorkflowValidationIssue[] = [];
  const knowledge = config.knowledge;

  if (!knowledge?.collectionId) {
    issues.push({
      id: "missing-collection",
      code: "missing_knowledge_collection",
      field: "knowledge.collectionId",
      message: "Select a knowledge collection to search.",
      severity: "error",
    });
  }
  if (!knowledge?.embeddingConnectionId || !knowledge?.vectorStoreConnectionId) {
    issues.push({
      id: "missing-connections",
      code: "missing_knowledge_connections",
      field: "knowledge.embeddingConnectionId",
      message: "Knowledge search requires embedding and vector store connections.",
      severity: "error",
    });
  }
  if (search.topK <= 0 || search.topK > 100) {
    issues.push({
      id: "invalid-top-k",
      code: "invalid_top_k",
      field: "metadata.knowledgeSearch.topK",
      message: "Top K must be between 1 and 100.",
      severity: "error",
    });
  }
  if (search.minimumScore < 0 || search.minimumScore > 1) {
    issues.push({
      id: "invalid-minimum-score",
      code: "invalid_minimum_score",
      field: "metadata.knowledgeSearch.minimumScore",
      message: "Minimum score must be between 0 and 1.",
      severity: "error",
    });
  }
  if (search.maxChunks <= 0 || search.maxChunks > 100) {
    issues.push({
      id: "invalid-max-chunks",
      code: "invalid_max_chunks",
      field: "metadata.knowledgeSearch.maxChunks",
      message: "Maximum chunks must be between 1 and 100.",
      severity: "error",
    });
  }
  return issues;
}

export function validateKnowledgeSearchOutputVariable(
  config: AIWorkflowNodeConfig,
): AIWorkflowValidationIssue[] {
  if (config.outputVariable?.trim()) return [];
  return [
    {
      id: "missing-output-variable",
      code: "missing_output_variable",
      field: "outputVariable",
      message: "Define an output variable to store the knowledge search result.",
      severity: "error",
    },
  ];
}

export function registerKnowledgeSearchValidationRules(
  register: (nodeKey: string, rule: (config: AIWorkflowNodeConfig) => AIWorkflowValidationIssue[]) => void,
): void {
  register("ai.knowledge_search", validateKnowledgeSearchQuery);
  register("ai.knowledge_search", validateKnowledgeSearchRetrievalConfig);
  register("ai.knowledge_search", validateKnowledgeSearchOutputVariable);
}
