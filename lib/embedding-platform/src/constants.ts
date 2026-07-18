export const EMBEDDING_PROVIDER_KEYS = [
  "openai",
  "azure_openai",
  "gemini",
  "cohere",
  "voyage",
  "ollama",
] as const;

export type EmbeddingProviderKey = (typeof EMBEDDING_PROVIDER_KEYS)[number];

export const ADAPTER_EMBEDDING_PROVIDER_KEYS = [
  "openai",
  "azure_openai",
  "gemini",
  "cohere",
  "voyage",
  "ollama",
] as const;

export type AdapterEmbeddingProviderKey = (typeof ADAPTER_EMBEDDING_PROVIDER_KEYS)[number];

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

export const EMBEDDING_STATUSES = ["pending", "active", "superseded", "failed", "archived"] as const;

export type EmbeddingStatus = (typeof EMBEDDING_STATUSES)[number];

export const EMBEDDING_JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export type EmbeddingJobStatus = (typeof EMBEDDING_JOB_STATUSES)[number];

export const EMBEDDING_PERMISSIONS = {
  view: "embeddings.view",
  manage: "embeddings.manage",
  generate: "embeddings.generate",
} as const;

export const EMBEDDING_AUDIT_EVENTS = [
  "embedding_requested",
  "embedding_generated",
  "embedding_failed",
  "embedding_regenerated",
  "embedding_activated",
] as const;

export type EmbeddingAuditEvent = (typeof EMBEDDING_AUDIT_EVENTS)[number];

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_PROVIDER_MAX_RETRIES = 2;
export const DEFAULT_EMBEDDING_BATCH_SIZE = 16;
export const DEFAULT_BATCH_PROCESS_LIMIT = 16;
