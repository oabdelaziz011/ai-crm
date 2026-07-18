import type { MetadataFilter } from "../types.js";

/** Public request DTO — never expose database entities. */
export type VectorQueryRequest = {
  companyId: string;
  connectionId: string;
  collectionId: string;
  embeddingId?: string;
  queryVector?: number[];
  policyId?: string;
  topK?: number;
  minimumScore?: number;
  metadataFilters?: MetadataFilter;
  correlationId?: string;
};

/** Public normalized result DTO — never expose provider payloads. */
export type NormalizedSearchResult = {
  indexedVectorId: string;
  normalizedScore: number;
  ranking: number;
  metadata: Record<string, unknown>;
};

/** Public response DTO — never expose database entities. */
export type VectorQueryResponse = {
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  provider: string;
  collectionId: string;
  policyId: string | null;
  resultCount: number;
  normalizedResults: NormalizedSearchResult[];
};

/** @deprecated Use VectorQueryRequest */
export type ExecuteVectorQueryInput = VectorQueryRequest;

/** @deprecated Use VectorQueryResponse */
export type ExecuteVectorQueryResult = {
  execution: import("../types.js").VectorQueryExecutionRecord;
  results: import("../types.js").VectorQueryResultRecord[];
};

export function toNormalizedSearchResult(input: {
  indexedVectorId: string;
  normalizedScore: number;
  ranking: number;
  metadata: Record<string, unknown>;
}): NormalizedSearchResult {
  return {
    indexedVectorId: input.indexedVectorId,
    normalizedScore: input.normalizedScore,
    ranking: input.ranking,
    metadata: sanitizeResultMetadata(input.metadata),
  };
}

export function toVectorQueryResponse(input: {
  executionId: string;
  correlationId: string | null;
  executionTimeMs: number;
  provider: string;
  collectionId: string;
  policyId: string | null;
  results: NormalizedSearchResult[];
}): VectorQueryResponse {
  return {
    executionId: input.executionId,
    correlationId: input.correlationId,
    executionTimeMs: input.executionTimeMs,
    provider: input.provider,
    collectionId: input.collectionId,
    policyId: input.policyId,
    resultCount: input.results.length,
    normalizedResults: input.results,
  };
}

function sanitizeResultMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase().includes("vector") || key.toLowerCase().includes("embedding")) continue;
    sanitized[key] = value;
  }
  return sanitized;
}
