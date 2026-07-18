export const RETRIEVAL_EXECUTION_STATUSES = ["queued", "running", "completed", "failed"] as const;

export type RetrievalExecutionStatus = (typeof RETRIEVAL_EXECUTION_STATUSES)[number];

export const CHUNK_SELECTION_STRATEGIES = ["score_first", "diversity_first", "balanced"] as const;

export type ChunkSelectionStrategy = (typeof CHUNK_SELECTION_STRATEGIES)[number];

export const RETRIEVAL_PERMISSIONS = {
  view: "retrieval.view",
  execute: "retrieval.execute",
  manage: "retrieval.manage",
} as const;

export const RETRIEVAL_AUDIT_EVENTS = [
  "retrieval_started",
  "retrieval_completed",
  "retrieval_failed",
  "retrieval_context_created",
  "retrieval_policy_updated",
] as const;

export type RetrievalAuditEvent = (typeof RETRIEVAL_AUDIT_EVENTS)[number];

export const DEFAULT_MAX_CONTEXT_TOKENS = 4096;
export const DEFAULT_MAX_CHUNKS = 20;
export const DEFAULT_WINDOW_EXPANSION = 1;
export const DEFAULT_MIN_SOURCE_DIVERSITY = 1;
export const DEFAULT_OVERLAP_REMOVAL_THRESHOLD = 0.85;

export const GENERIC_RETRIEVAL_METADATA_KEYS = [
  "document_type",
  "knowledge_source",
  "department",
  "language",
  "tags",
  "owner",
  "created_date",
  "updated_date",
] as const;
