import type { ServiceContext } from "../types.js";

export type RuntimeKnowledgeQueryInput = {
  companyId: string;
  question: string;
  embeddingConnectionId: string;
  vectorStoreConnectionId: string;
  collectionId: string;
  embeddingModel?: string;
  retrievalPolicyId?: string;
  vectorQueryPolicyId?: string;
  maxTokenBudget?: number;
  metadataFilters?: Record<string, unknown>;
  topK?: number;
  minimumScore?: number;
  correlationId?: string;
  policyKey?: string;
};

export type RuntimeKnowledgeQueryResult = {
  contextText: string;
  chunks: Array<{ id: string; content: string; score: number | null; rank: number; tokenCount: number }>;
  citations?: Array<{
    citationId: string;
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sectionTitle: string | null;
    confidence: number;
  }>;
  confidence?: number;
  searchMode?: "vector" | "keyword" | "hybrid";
  chunkCount: number;
  totalTokens: number;
  executionId: string;
  vectorQueryExecutionId: string;
  retrievalLatencyMs: number;
  rankingLatencyMs: number;
  policyId: string | null;
};

export interface RuntimeKnowledgePort {
  retrieve(ctx: ServiceContext, input: RuntimeKnowledgeQueryInput): Promise<RuntimeKnowledgeQueryResult>;
}

export type KnowledgeContextSnapshot = {
  contextText: string;
  chunkCount: number;
  totalTokens: number;
  executionId?: string;
  confidence?: number;
  searchMode?: "vector" | "keyword" | "hybrid";
  citations?: RuntimeKnowledgeQueryResult["citations"];
  chunks?: Array<{ id: string; content: string; score: number | null }>;
};

export function mapKnowledgeQueryResult(result: RuntimeKnowledgeQueryResult): KnowledgeContextSnapshot {
  return {
    contextText: result.contextText,
    chunkCount: result.chunkCount,
    totalTokens: result.totalTokens,
    executionId: result.executionId,
    confidence: result.confidence,
    searchMode: result.searchMode,
    citations: result.citations,
    chunks: result.chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      score: chunk.score,
    })),
  };
}
