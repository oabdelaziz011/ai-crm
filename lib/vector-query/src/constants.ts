export const VECTOR_QUERY_PROVIDER_KEYS = [
  "pgvector",
  "pinecone",
  "qdrant",
  "chroma",
  "azure_ai_search",
] as const;

export type VectorQueryProviderKey = (typeof VECTOR_QUERY_PROVIDER_KEYS)[number];

export const QUERY_PROVIDER_CAPABILITIES = [
  "similarity_query",
  "metadata_filter",
  "collection_statistics",
] as const;

export type QueryProviderCapability = (typeof QUERY_PROVIDER_CAPABILITIES)[number];

export const EXECUTION_STATUSES = ["queued", "running", "completed", "failed"] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const VECTOR_QUERY_PERMISSIONS = {
  view: "vectorquery.view",
  execute: "vectorquery.execute",
  manage: "vectorquery.manage",
} as const;

export const VECTOR_QUERY_AUDIT_EVENTS = [
  "vector_query_started",
  "vector_query_completed",
  "vector_query_failed",
  "vector_results_ranked",
  "search_policy_updated",
] as const;

export type VectorQueryAuditEvent = (typeof VECTOR_QUERY_AUDIT_EVENTS)[number];

export const DEFAULT_TOP_K = 10;
export const DEFAULT_MINIMUM_SIMILARITY = 0;
export const DEFAULT_MAXIMUM_RESULTS = 50;

export const GENERIC_METADATA_FILTER_KEYS = [
  "document_type",
  "knowledge_source",
  "department",
  "language",
  "tags",
  "company",
  "owner",
  "created_date",
  "updated_date",
] as const;
