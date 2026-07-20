import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import {
  AI_KNOWLEDGE_SEARCH_NODE_KEY,
  DEFAULT_KNOWLEDGE_SEARCH_OUTPUT_VARIABLE,
  KNOWLEDGE_SEARCH_MODES,
  type KnowledgeSearchInputSource,
  type KnowledgeSearchMode,
} from "./constants.js";

export type KnowledgeSearchFilters = {
  tags: string[];
  categories: string[];
  documentTypes: string[];
  tenantScope: string | null;
};

export type AIKnowledgeSearchNodeMetadata = {
  inputSource: KnowledgeSearchInputSource;
  inputVariable: string | null;
  staticQuery: string | null;
  upstreamVariable: string | null;
  searchMode: KnowledgeSearchMode;
  topK: number;
  minimumScore: number;
  maxChunks: number;
  includeContextText: boolean;
  includeChunks: boolean;
  includeMetadata: boolean;
  policyKey: string | null;
  filters: KnowledgeSearchFilters;
};

export function createDefaultKnowledgeSearchFilters(): KnowledgeSearchFilters {
  return {
    tags: [],
    categories: [],
    documentTypes: [],
    tenantScope: null,
  };
}

export function createDefaultKnowledgeSearchMetadata(
  overrides: Partial<AIKnowledgeSearchNodeMetadata> = {},
): AIKnowledgeSearchNodeMetadata {
  const base = {
    inputSource: "variable" as const,
    inputVariable: "input",
    staticQuery: null,
    upstreamVariable: null,
    searchMode: "semantic" as const,
    topK: 12,
    minimumScore: 0.7,
    maxChunks: 8,
    includeContextText: true,
    includeChunks: true,
    includeMetadata: true,
    policyKey: "default",
    filters: createDefaultKnowledgeSearchFilters(),
  };
  return {
    ...base,
    ...overrides,
    filters: {
      ...base.filters,
      ...overrides.filters,
    },
  };
}

export function readKnowledgeSearchMetadata(config: AIWorkflowNodeConfig): AIKnowledgeSearchNodeMetadata {
  const raw = config.metadata?.knowledgeSearch;
  if (!raw || typeof raw !== "object") return createDefaultKnowledgeSearchMetadata();
  const value = raw as Record<string, unknown>;
  const inputSource = ["variable", "static", "conversation_message", "decision_output", "extract_output", "summarizer_output", "custom_query"].includes(
    String(value.inputSource),
  )
    ? (value.inputSource as KnowledgeSearchInputSource)
    : "variable";
  const filtersRaw =
    value.filters && typeof value.filters === "object" ? (value.filters as Record<string, unknown>) : {};
  return createDefaultKnowledgeSearchMetadata({
    inputSource,
    inputVariable: typeof value.inputVariable === "string" ? value.inputVariable : "input",
    staticQuery: typeof value.staticQuery === "string" ? value.staticQuery : null,
    upstreamVariable: typeof value.upstreamVariable === "string" ? value.upstreamVariable : null,
    searchMode: KNOWLEDGE_SEARCH_MODES.includes(value.searchMode as KnowledgeSearchMode)
      ? (value.searchMode as KnowledgeSearchMode)
      : "semantic",
    topK: typeof value.topK === "number" ? value.topK : 12,
    minimumScore: typeof value.minimumScore === "number" ? value.minimumScore : 0.7,
    maxChunks: typeof value.maxChunks === "number" ? value.maxChunks : 8,
    includeContextText: value.includeContextText !== false,
    includeChunks: value.includeChunks !== false,
    includeMetadata: value.includeMetadata !== false,
    policyKey: typeof value.policyKey === "string" ? value.policyKey : "default",
    filters: {
      tags: Array.isArray(filtersRaw.tags) ? filtersRaw.tags.map(String) : [],
      categories: Array.isArray(filtersRaw.categories) ? filtersRaw.categories.map(String) : [],
      documentTypes: Array.isArray(filtersRaw.documentTypes) ? filtersRaw.documentTypes.map(String) : [],
      tenantScope: typeof filtersRaw.tenantScope === "string" ? filtersRaw.tenantScope : null,
    },
  });
}

export function patchKnowledgeSearchMetadata(
  config: AIWorkflowNodeConfig,
  patch: Partial<AIKnowledgeSearchNodeMetadata>,
): AIWorkflowNodeConfig {
  const current = readKnowledgeSearchMetadata(config);
  return {
    ...config,
    metadata: {
      ...config.metadata,
      knowledgeSearch: {
        ...current,
        ...patch,
        filters: {
          ...current.filters,
          ...patch.filters,
        },
      },
    },
  };
}

export function createDefaultKnowledgeSearchNodeConfig(): AIWorkflowNodeConfig {
  return {
    nodeKey: AI_KNOWLEDGE_SEARCH_NODE_KEY,
    nodeVersion: "1.0.0",
    promptTemplateKey: null,
    promptTemplateType: "workflow",
    outputMode: "structured",
    outputVariable: DEFAULT_KNOWLEDGE_SEARCH_OUTPUT_VARIABLE,
    outputSchema: null,
    policies: {
      maxTokens: 2048,
      streaming: false,
    },
    knowledge: {
      enabled: true,
      collectionId: null,
      embeddingConnectionId: null,
      vectorStoreConnectionId: null,
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    },
    metadata: {
      knowledgeSearch: createDefaultKnowledgeSearchMetadata(),
    },
  };
}

export { AI_KNOWLEDGE_SEARCH_NODE_KEY };
