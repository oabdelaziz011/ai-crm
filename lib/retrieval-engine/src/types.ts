import type { ChunkSelectionStrategy, RetrievalExecutionStatus } from "./constants.js";

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type RetrievalPolicyRecord = {
  id: string;
  company_id: string;
  policy_name: string;
  max_context_tokens: number;
  max_chunks: number;
  window_expansion: number;
  min_source_diversity: number;
  overlap_removal_threshold: number;
  default_language: string | null;
  source_priority: Record<string, number>;
  department_priority: Record<string, number>;
  chunk_selection_strategy: ChunkSelectionStrategy;
  metadata: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type RetrievalExecutionRecord = {
  id: string;
  company_id: string;
  vector_query_execution_id: string;
  policy_id: string | null;
  execution_status: RetrievalExecutionStatus;
  execution_time_ms: number | null;
  correlation_id: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RetrievalContextRecord = {
  id: string;
  company_id: string;
  execution_id: string;
  context_checksum: string;
  chunk_count: number;
  total_tokens: number;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RetrievalContextChunkRecord = {
  id: string;
  context_id: string;
  knowledge_chunk_id: string;
  indexed_vector_id: string | null;
  selection_rank: number;
  normalized_score: number | null;
  token_count: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RetrievalMetricsRecord = {
  id: string;
  company_id: string;
  execution_id: string;
  policy_id: string | null;
  duration_ms: number;
  chunks_selected: number;
  chunks_rejected: number;
  chunks_discarded_budget: number;
  budget_tokens: number;
  budget_used_tokens: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateRetrievalPolicyInput = {
  companyId: string;
  policyName: string;
  maxContextTokens?: number;
  maxChunks?: number;
  windowExpansion?: number;
  minSourceDiversity?: number;
  overlapRemovalThreshold?: number;
  defaultLanguage?: string | null;
  sourcePriority?: Record<string, number>;
  departmentPriority?: Record<string, number>;
  chunkSelectionStrategy?: ChunkSelectionStrategy;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type UpdateRetrievalPolicyInput = {
  policyId: string;
  policyName?: string;
  maxContextTokens?: number;
  maxChunks?: number;
  windowExpansion?: number;
  minSourceDiversity?: number;
  overlapRemovalThreshold?: number;
  defaultLanguage?: string | null;
  sourcePriority?: Record<string, number>;
  departmentPriority?: Record<string, number>;
  chunkSelectionStrategy?: ChunkSelectionStrategy;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
};

export type CreateRetrievalExecutionInput = {
  companyId: string;
  vectorQueryExecutionId: string;
  policyId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateRetrievalContextInput = {
  companyId: string;
  executionId: string;
  contextChecksum: string;
  chunkCount: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
};

export type CreateRetrievalContextChunkInput = {
  contextId: string;
  knowledgeChunkId: string;
  indexedVectorId?: string | null;
  selectionRank: number;
  normalizedScore?: number | null;
  tokenCount: number;
  content: string;
  metadata?: Record<string, unknown>;
};

export type CreateRetrievalMetricsInput = {
  companyId: string;
  executionId: string;
  policyId?: string | null;
  durationMs: number;
  chunksSelected: number;
  chunksRejected: number;
  chunksDiscardedBudget: number;
  budgetTokens: number;
  budgetUsedTokens: number;
  metadata?: Record<string, unknown>;
};

export type ResolvedRetrievalPolicy = {
  policyId: string | null;
  maxContextTokens: number;
  maxChunks: number;
  windowExpansion: number;
  minSourceDiversity: number;
  overlapRemovalThreshold: number;
  defaultLanguage: string | null;
  sourcePriority: Record<string, number>;
  departmentPriority: Record<string, number>;
  chunkSelectionStrategy: ChunkSelectionStrategy;
  metadata: Record<string, unknown>;
};

export type VectorQueryResultSnapshot = {
  id: string;
  indexedVectorId: string;
  normalizedScore: number;
  ranking: number;
  metadata: Record<string, unknown>;
};

export type VectorQueryExecutionSnapshot = {
  id: string;
  companyId: string;
  collectionId: string;
  executionStatus: string;
  resultCount: number;
};

export type KnowledgeChunkSnapshot = {
  id: string;
  companyId: string;
  documentId: string;
  versionId: string | null;
  sectionId: string | null;
  chunkIndex: number;
  chunkOrder: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
};

export type KnowledgeDocumentSnapshot = {
  id: string;
  companyId: string;
  sourceId: string;
  title: string;
  language: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeSourceSnapshot = {
  id: string;
  companyId: string;
  key: string;
  sourceType: string;
  displayName: string;
};

export type RetrievalCandidateChunk = {
  knowledgeChunkId: string;
  indexedVectorId: string | null;
  normalizedScore: number;
  ranking: number;
  content: string;
  tokenCount: number;
  documentId: string;
  sourceId: string;
  sourceKey: string;
  sourceType: string;
  department: string | null;
  language: string;
  metadata: Record<string, unknown>;
};

export type SelectedRetrievalChunk = RetrievalCandidateChunk & {
  selectionReason: string;
};

export type BudgetedRetrievalChunk = SelectedRetrievalChunk & {
  included: boolean;
  discardReason?: string;
};

export type AssembledRetrievalChunk = BudgetedRetrievalChunk & {
  selectionRank: number;
  references: {
    documentId: string;
    sourceId: string;
    knowledgeChunkId: string;
    indexedVectorId: string | null;
  };
};

export type RetrievalMetricsSnapshot = {
  durationMs: number;
  chunksSelected: number;
  chunksRejected: number;
  chunksDiscardedBudget: number;
  budgetTokens: number;
  budgetUsedTokens: number;
  policyId: string | null;
};

export type RetrievalTelemetryEvent = {
  companyId: string;
  correlationId: string;
  executionId: string;
  policyId: string | null;
  chunksSelected: number;
  chunksRejected: number;
  budgetUsedTokens: number;
  budgetTokens: number;
  executionTimeMs: number;
  error?: string | null;
};
