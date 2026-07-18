import type { AssembledRetrievalChunk } from "../types.js";

/** Public request DTO — never expose database entities. */
export type RetrievalRequest = {
  companyId: string;
  vectorQueryExecutionId: string;
  policyId?: string;
  maxTokenBudget?: number;
  correlationId?: string;
};

/** Public chunk DTO — never expose provider payloads. */
export type RetrievalChunk = {
  knowledgeChunkId: string;
  indexedVectorId: string | null;
  selectionRank: number;
  normalizedScore: number | null;
  tokenCount: number;
  content: string;
  metadata: Record<string, unknown>;
  references: {
    documentId: string;
    sourceId: string;
  };
};

/** Public context DTO. */
export type RetrievalContext = {
  contextId: string;
  executionId: string;
  chunkCount: number;
  totalTokens: number;
  chunks: RetrievalChunk[];
  metadata: Record<string, unknown>;
};

/** Public response DTO — never expose database entities. */
export type RetrievalResponse = {
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  policyId: string | null;
  context: RetrievalContext;
  metrics: {
    chunksSelected: number;
    chunksRejected: number;
    chunksDiscardedBudget: number;
    budgetTokens: number;
    budgetUsedTokens: number;
  };
};

/** End-to-end semantic retrieval request — question to assembled context. */
export type SemanticRetrievalRequest = {
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
};

/** End-to-end semantic retrieval response — includes orchestration metadata. */
export type SemanticRetrievalResponse = RetrievalResponse & {
  vectorQueryExecutionId: string;
  queryEmbedding: {
    dimensions: number;
    providerKey: string;
    model: string;
  };
  orchestrationTimeMs: number;
};

export function toRetrievalChunk(chunk: AssembledRetrievalChunk): RetrievalChunk {
  return {
    knowledgeChunkId: chunk.knowledgeChunkId,
    indexedVectorId: chunk.indexedVectorId,
    selectionRank: chunk.selectionRank,
    normalizedScore: chunk.normalizedScore,
    tokenCount: chunk.tokenCount,
    content: chunk.content,
    metadata: sanitizeChunkMetadata(chunk.metadata),
    references: {
      documentId: chunk.references.documentId,
      sourceId: chunk.references.sourceId,
    },
  };
}

export function toRetrievalContext(input: {
  contextId: string;
  executionId: string;
  chunkCount: number;
  totalTokens: number;
  chunks: AssembledRetrievalChunk[];
  metadata?: Record<string, unknown>;
}): RetrievalContext {
  return {
    contextId: input.contextId,
    executionId: input.executionId,
    chunkCount: input.chunkCount,
    totalTokens: input.totalTokens,
    chunks: input.chunks.map(toRetrievalChunk),
    metadata: input.metadata ?? {},
  };
}

export function toRetrievalResponse(input: {
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  policyId: string | null;
  context: RetrievalContext;
  metrics: RetrievalResponse["metrics"];
}): RetrievalResponse {
  return {
    executionId: input.executionId,
    correlationId: input.correlationId,
    executionTimeMs: input.executionTimeMs,
    policyId: input.policyId,
    context: input.context,
    metrics: input.metrics,
  };
}

function sanitizeChunkMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase().includes("vector") || key.toLowerCase().includes("embedding")) continue;
    sanitized[key] = value;
  }
  return sanitized;
}
