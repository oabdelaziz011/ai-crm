export const VECTOR_STORE_PROVIDER_KEYS = [
  "pgvector",
  "pinecone",
  "qdrant",
  "chroma",
  "azure_ai_search",
] as const;

export type VectorStoreProviderKey = (typeof VECTOR_STORE_PROVIDER_KEYS)[number];

export const ADAPTER_VECTOR_STORE_PROVIDER_KEYS = [
  "pgvector",
  "pinecone",
  "qdrant",
  "chroma",
  "azure_ai_search",
] as const;

export type AdapterVectorStoreProviderKey = (typeof ADAPTER_VECTOR_STORE_PROVIDER_KEYS)[number];

export const VECTOR_STORE_CAPABILITIES = [
  "create_collection",
  "delete_collection",
  "upsert_vector",
  "delete_vector",
  "collection_statistics",
] as const;

export type VectorStoreCapability = (typeof VECTOR_STORE_CAPABILITIES)[number];

export const PROVIDER_CONNECTION_STATUSES = ["pending", "active", "disabled", "error"] as const;

export type ProviderConnectionStatus = (typeof PROVIDER_CONNECTION_STATUSES)[number];

export const PROVIDER_HEALTH_STATUSES = [
  "connected",
  "disconnected",
  "warning",
  "error",
  "unknown",
] as const;

export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number];

export const COLLECTION_STATUSES = ["pending", "active", "archived"] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const INDEXED_VECTOR_STATUSES = ["pending", "indexed", "failed", "removed"] as const;

export type IndexedVectorStatus = (typeof INDEXED_VECTOR_STATUSES)[number];

export const VECTOR_STORE_PERMISSIONS = {
  view: "vectorstores.view",
  manage: "vectorstores.manage",
  collectionsManage: "collections.manage",
} as const;

export const VECTOR_STORE_AUDIT_EVENTS = [
  "vector_collection_created",
  "vector_collection_deleted",
  "vector_indexed",
  "vector_removed",
  "provider_connected",
  "provider_disconnected",
] as const;

export type VectorStoreAuditEvent = (typeof VECTOR_STORE_AUDIT_EVENTS)[number];

export const PGVECTOR_MAX_DIMENSIONS = 1536;
