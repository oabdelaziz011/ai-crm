export const AI_KNOWLEDGE_SEARCH_NODE_KEY = "ai.knowledge_search" as const;

export const DEFAULT_KNOWLEDGE_SEARCH_OUTPUT_VARIABLE = "knowledge_result";

export const KNOWLEDGE_SEARCH_INPUT_SOURCES = [
  "variable",
  "static",
  "conversation_message",
  "decision_output",
  "extract_output",
  "summarizer_output",
  "custom_query",
] as const;

export type KnowledgeSearchInputSource = (typeof KNOWLEDGE_SEARCH_INPUT_SOURCES)[number];

export const KNOWLEDGE_SEARCH_MODES = ["semantic", "hybrid"] as const;
export type KnowledgeSearchMode = (typeof KNOWLEDGE_SEARCH_MODES)[number];

export const KNOWLEDGE_SEARCH_OUTPUT_MODES = ["structured", "json", "array", "text"] as const;
