import type { ExecutionStatus, QueryProviderCapability } from "./constants.js";

export type JsonSchema = Record<string, unknown>;

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type MetadataFilter = Record<string, string | number | boolean | string[]>;

export type VectorSearchPolicyRecord = {
  id: string;
  company_id: string;
  policy_name: string;
  default_top_k: number;
  minimum_similarity_score: number;
  maximum_results: number;
  metadata: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type VectorQueryExecutionRecord = {
  id: string;
  company_id: string;
  vector_store_connection_id: string;
  collection_id: string;
  embedding_id: string | null;
  policy_id: string | null;
  query_checksum: string;
  execution_status: ExecutionStatus;
  execution_time_ms: number | null;
  provider: string;
  result_count: number;
  correlation_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VectorQueryResultRecord = {
  id: string;
  execution_id: string;
  indexed_vector_id: string;
  normalized_score: number;
  provider_score: number | null;
  ranking: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type VectorStoreConnectionSnapshot = {
  id: string;
  company_id: string;
  provider_key: string;
  configuration: Record<string, unknown>;
  is_enabled: boolean;
};

export type VectorCollectionSnapshot = {
  id: string;
  company_id: string;
  connection_id: string;
  name: string;
  provider: string;
  embedding_version: number;
  is_active: boolean;
};

export type KnowledgeEmbeddingSnapshot = {
  id: string;
  company_id: string;
  vector: number[];
  is_active: boolean;
  status: string;
};

export type IndexedVectorSnapshot = {
  id: string;
  company_id: string;
  collection_id: string;
  knowledge_embedding_id: string;
  provider: string;
  external_reference: string;
  status: string;
  metadata: Record<string, unknown>;
};

export type CreateSearchPolicyInput = {
  companyId: string;
  policyName: string;
  defaultTopK?: number;
  minimumSimilarityScore?: number;
  maximumResults?: number;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type UpdateSearchPolicyInput = {
  policyId: string;
  policyName?: string;
  defaultTopK?: number;
  minimumSimilarityScore?: number;
  maximumResults?: number;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type CreateQueryExecutionInput = {
  companyId: string;
  vectorStoreConnectionId: string;
  collectionId: string;
  embeddingId?: string | null;
  policyId?: string | null;
  queryChecksum: string;
  provider: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateQueryExecutionInput = {
  executionId: string;
  executionStatus?: ExecutionStatus;
  executionTimeMs?: number | null;
  resultCount?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateQueryResultInput = {
  executionId: string;
  indexedVectorId: string;
  normalizedScore: number;
  providerScore?: number | null;
  ranking: number;
  metadata?: Record<string, unknown>;
};

export type ResolvedSearchPolicy = {
  policyId: string | null;
  defaultTopK: number;
  minimumSimilarityScore: number;
  maximumResults: number;
  metadata: Record<string, unknown>;
};

export type ConfigurationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ProviderQueryHit = {
  vectorId: string;
  providerScore: number;
  metadata?: Record<string, unknown>;
};

export type ProviderQueryInput = {
  collectionName: string;
  queryVector: number[];
  topK: number;
  metadataFilters?: MetadataFilter;
};

export type ProviderQueryResult = {
  hits: ProviderQueryHit[];
  providerKey: string;
  mock?: boolean;
};

export type HealthResult = {
  status: "connected" | "disconnected" | "warning" | "error" | "unknown";
  providerKey: string;
  message: string;
  checkedAt: string;
  mock?: boolean;
};

export type QueryStatisticsInput = {
  collectionName: string;
};

export type QueryStatisticsResult = {
  collectionName: string;
  indexedVectorCount: number;
  providerKey: string;
  mock?: boolean;
};

export type ResolveVectorQueryProviderInput = {
  providerKey: string;
  configuration: Record<string, unknown>;
};

export type NormalizedQueryHit = {
  vectorId: string;
  indexedVectorId: string;
  normalizedScore: number;
  providerScore: number;
  metadata: Record<string, unknown>;
};

export type RankedQueryHit = NormalizedQueryHit & {
  ranking: number;
};

export type VectorQueryTelemetryEvent = {
  companyId: string;
  correlationId: string;
  provider: string;
  collectionId: string;
  policyId: string | null;
  resultCount: number;
  executionTimeMs: number;
  error?: string | null;
};
