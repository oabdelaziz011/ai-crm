import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RetrievalContextNotFoundError,
  RetrievalExecutionNotFoundError,
  RetrievalPolicyNotFoundError,
} from "../errors/error-catalog.js";
import type {
  KnowledgeHydrationReadRepository,
  RetrievalContextRepository,
  RetrievalExecutionRepository,
  RetrievalMetricsRepository,
  RetrievalPolicyRepository,
  VectorQueryReadRepository,
} from "./retrieval-repositories.js";
import type {
  CreateRetrievalContextChunkInput,
  CreateRetrievalContextInput,
  CreateRetrievalExecutionInput,
  CreateRetrievalMetricsInput,
  CreateRetrievalPolicyInput,
  KnowledgeChunkSnapshot,
  KnowledgeDocumentSnapshot,
  KnowledgeSourceSnapshot,
  RetrievalContextChunkRecord,
  RetrievalContextRecord,
  RetrievalExecutionRecord,
  RetrievalMetricsRecord,
  RetrievalPolicyRecord,
  UpdateRetrievalPolicyInput,
  VectorQueryExecutionSnapshot,
  VectorQueryResultSnapshot,
} from "../types.js";

const POLICIES_TABLE = "retrieval_policies";
const EXECUTIONS_TABLE = "retrieval_executions";
const CONTEXTS_TABLE = "retrieval_contexts";
const CONTEXT_CHUNKS_TABLE = "retrieval_context_chunks";
const METRICS_TABLE = "retrieval_metrics";
const VECTOR_EXECUTIONS_TABLE = "vector_query_executions";
const VECTOR_RESULTS_TABLE = "vector_query_results";
const INDEXED_VECTORS_TABLE = "indexed_vectors";
const EMBEDDINGS_TABLE = "knowledge_embeddings";
const CHUNKS_TABLE = "knowledge_chunks";
const DOCUMENTS_TABLE = "knowledge_documents";
const SOURCES_TABLE = "knowledge_sources";

function mapPolicy(row: Record<string, unknown>): RetrievalPolicyRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    policy_name: row.policy_name as string,
    max_context_tokens: Number(row.max_context_tokens),
    max_chunks: Number(row.max_chunks),
    window_expansion: Number(row.window_expansion),
    min_source_diversity: Number(row.min_source_diversity),
    overlap_removal_threshold: Number(row.overlap_removal_threshold),
    default_language: (row.default_language as string | null) ?? null,
    source_priority: (row.source_priority as Record<string, number>) ?? {},
    department_priority: (row.department_priority as Record<string, number>) ?? {},
    chunk_selection_strategy: row.chunk_selection_strategy as RetrievalPolicyRecord["chunk_selection_strategy"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    is_default: Boolean(row.is_default),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExecution(row: Record<string, unknown>): RetrievalExecutionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    vector_query_execution_id: row.vector_query_execution_id as string,
    policy_id: (row.policy_id as string | null) ?? null,
    execution_status: row.execution_status as RetrievalExecutionRecord["execution_status"],
    execution_time_ms: row.execution_time_ms == null ? null : Number(row.execution_time_ms),
    correlation_id: (row.correlation_id as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapContext(row: Record<string, unknown>): RetrievalContextRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    execution_id: row.execution_id as string,
    context_checksum: row.context_checksum as string,
    chunk_count: Number(row.chunk_count),
    total_tokens: Number(row.total_tokens),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapContextChunk(row: Record<string, unknown>): RetrievalContextChunkRecord {
  return {
    id: row.id as string,
    context_id: row.context_id as string,
    knowledge_chunk_id: row.knowledge_chunk_id as string,
    indexed_vector_id: (row.indexed_vector_id as string | null) ?? null,
    selection_rank: Number(row.selection_rank),
    normalized_score: row.normalized_score == null ? null : Number(row.normalized_score),
    token_count: Number(row.token_count),
    content: row.content as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

function mapMetrics(row: Record<string, unknown>): RetrievalMetricsRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    execution_id: row.execution_id as string,
    policy_id: (row.policy_id as string | null) ?? null,
    duration_ms: Number(row.duration_ms),
    chunks_selected: Number(row.chunks_selected),
    chunks_rejected: Number(row.chunks_rejected),
    chunks_discarded_budget: Number(row.chunks_discarded_budget),
    budget_tokens: Number(row.budget_tokens),
    budget_used_tokens: Number(row.budget_used_tokens),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

function isArchivedPolicy(record: RetrievalPolicyRecord): boolean {
  return record.metadata.archived === true;
}

export function createSupabaseRetrievalPolicyRepository(client: SupabaseClient): RetrievalPolicyRepository {
  return {
    async findByCompany(companyId) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .order("policy_name");
      if (error) throw error;
      return (data ?? []).map((row) => mapPolicy(row as Record<string, unknown>)).filter((item) => !isArchivedPolicy(item));
    },
    async create(input) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .insert({
          company_id: input.companyId,
          policy_name: input.policyName,
          max_context_tokens: input.maxContextTokens,
          max_chunks: input.maxChunks,
          window_expansion: input.windowExpansion,
          min_source_diversity: input.minSourceDiversity,
          overlap_removal_threshold: input.overlapRemovalThreshold,
          default_language: input.defaultLanguage ?? null,
          source_priority: input.sourcePriority ?? {},
          department_priority: input.departmentPriority ?? {},
          chunk_selection_strategy: input.chunkSelectionStrategy ?? "score_first",
          metadata: input.metadata ?? {},
          is_default: input.isDefault ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapPolicy(data as Record<string, unknown>);
    },
    async update(input) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .update({
          policy_name: input.policyName,
          max_context_tokens: input.maxContextTokens,
          max_chunks: input.maxChunks,
          window_expansion: input.windowExpansion,
          min_source_diversity: input.minSourceDiversity,
          overlap_removal_threshold: input.overlapRemovalThreshold,
          default_language: input.defaultLanguage,
          source_priority: input.sourcePriority,
          department_priority: input.departmentPriority,
          chunk_selection_strategy: input.chunkSelectionStrategy,
          metadata: input.metadata,
          is_default: input.isDefault,
        })
        .eq("id", input.policyId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RetrievalPolicyNotFoundError(input.policyId);
      return mapPolicy(data as Record<string, unknown>);
    },
    async archive(policyId) {
      const existing = await this.findById(policyId);
      if (!existing) throw new RetrievalPolicyNotFoundError(policyId);
      return this.update({
        policyId,
        metadata: { ...existing.metadata, archived: true },
      });
    },
    async findById(id) {
      const { data, error } = await client.from(POLICIES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapPolicy(data as Record<string, unknown>) : null;
    },
    async findDefault(companyId) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPolicy(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseRetrievalExecutionRepository(client: SupabaseClient): RetrievalExecutionRepository {
  return {
    async createExecution(input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          vector_query_execution_id: input.vectorQueryExecutionId,
          policy_id: input.policyId ?? null,
          execution_status: "running",
          correlation_id: input.correlationId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },
    async updateStatus(executionId, status) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ execution_status: status })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RetrievalExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async completeExecution(executionId, input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          execution_status: "completed",
          execution_time_ms: input.executionTimeMs,
          metadata: input.metadata,
        })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RetrievalExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async failExecution(executionId, input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          execution_status: "failed",
          execution_time_ms: input.executionTimeMs,
          error_message: input.errorMessage,
        })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RetrievalExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async findExecution(id) {
      const { data, error } = await client.from(EXECUTIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapExecution(data as Record<string, unknown>) : null;
    },
    async findByCompany(companyId) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapExecution(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseRetrievalContextRepository(client: SupabaseClient): RetrievalContextRepository {
  return {
    async createContext(input) {
      const { data, error } = await client
        .from(CONTEXTS_TABLE)
        .insert({
          company_id: input.companyId,
          execution_id: input.executionId,
          context_checksum: input.contextChecksum,
          chunk_count: input.chunkCount,
          total_tokens: input.totalTokens,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapContext(data as Record<string, unknown>);
    },
    async saveContextChunks(inputs) {
      if (inputs.length === 0) return [];
      const { data, error } = await client
        .from(CONTEXT_CHUNKS_TABLE)
        .insert(
          inputs.map((input) => ({
            context_id: input.contextId,
            knowledge_chunk_id: input.knowledgeChunkId,
            indexed_vector_id: input.indexedVectorId ?? null,
            selection_rank: input.selectionRank,
            normalized_score: input.normalizedScore ?? null,
            token_count: input.tokenCount,
            content: input.content,
            metadata: input.metadata ?? {},
          })),
        )
        .select("*");
      if (error) throw error;
      return (data ?? []).map((row) => mapContextChunk(row as Record<string, unknown>));
    },
    async findContext(id) {
      const { data, error } = await client.from(CONTEXTS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapContext(data as Record<string, unknown>) : null;
    },
    async listContextChunks(contextId) {
      const { data, error } = await client
        .from(CONTEXT_CHUNKS_TABLE)
        .select("*")
        .eq("context_id", contextId)
        .order("selection_rank");
      if (error) throw error;
      return (data ?? []).map((row) => mapContextChunk(row as Record<string, unknown>));
    },
    async findContextByExecution(executionId) {
      const { data, error } = await client
        .from(CONTEXTS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapContext(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseRetrievalMetricsRepository(client: SupabaseClient): RetrievalMetricsRepository {
  return {
    async saveMetrics(input) {
      const { data, error } = await client
        .from(METRICS_TABLE)
        .insert({
          company_id: input.companyId,
          execution_id: input.executionId,
          policy_id: input.policyId ?? null,
          duration_ms: input.durationMs,
          chunks_selected: input.chunksSelected,
          chunks_rejected: input.chunksRejected,
          chunks_discarded_budget: input.chunksDiscardedBudget,
          budget_tokens: input.budgetTokens,
          budget_used_tokens: input.budgetUsedTokens,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapMetrics(data as Record<string, unknown>);
    },
    async findByExecution(executionId) {
      const { data, error } = await client.from(METRICS_TABLE).select("*").eq("execution_id", executionId).maybeSingle();
      if (error) throw error;
      return data ? mapMetrics(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseVectorQueryReadRepository(client: SupabaseClient): VectorQueryReadRepository {
  return {
    async findExecution(executionId) {
      const { data, error } = await client.from(VECTOR_EXECUTIONS_TABLE).select("*").eq("id", executionId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        companyId: row.company_id as string,
        collectionId: row.collection_id as string,
        executionStatus: row.execution_status as string,
        resultCount: Number(row.result_count),
      } satisfies VectorQueryExecutionSnapshot;
    },
    async listResults(executionId) {
      const { data, error } = await client
        .from(VECTOR_RESULTS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .order("ranking");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: item.id as string,
          indexedVectorId: item.indexed_vector_id as string,
          normalizedScore: Number(item.normalized_score),
          ranking: Number(item.ranking),
          metadata: (item.metadata as Record<string, unknown>) ?? {},
        } satisfies VectorQueryResultSnapshot;
      });
    },
  };
}

export function createSupabaseKnowledgeHydrationReadRepository(
  client: SupabaseClient,
): KnowledgeHydrationReadRepository {
  return {
    async resolveChunkFromIndexedVector(indexedVectorId) {
      const { data: indexed, error: indexedError } = await client
        .from(INDEXED_VECTORS_TABLE)
        .select("knowledge_embedding_id")
        .eq("id", indexedVectorId)
        .maybeSingle();
      if (indexedError) throw indexedError;
      if (!indexed) return null;

      const { data: embedding, error: embeddingError } = await client
        .from(EMBEDDINGS_TABLE)
        .select("knowledge_chunk_id")
        .eq("id", (indexed as Record<string, unknown>).knowledge_embedding_id as string)
        .maybeSingle();
      if (embeddingError) throw embeddingError;
      if (!embedding) return null;

      const chunkId = (embedding as Record<string, unknown>).knowledge_chunk_id as string;
      const { data: chunk, error: chunkError } = await client
        .from(CHUNKS_TABLE)
        .select("*")
        .eq("id", chunkId)
        .is("deleted_at", null)
        .maybeSingle();
      if (chunkError) throw chunkError;
      if (!chunk) return null;

      const row = chunk as Record<string, unknown>;
      return {
        id: row.id as string,
        companyId: row.company_id as string,
        documentId: row.document_id as string,
        versionId: (row.version_id as string | null) ?? null,
        sectionId: (row.section_id as string | null) ?? null,
        chunkIndex: Number(row.chunk_index),
        chunkOrder: Number(row.chunk_order),
        content: row.content as string,
        tokenCount: Number(row.token_count),
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      } satisfies KnowledgeChunkSnapshot;
    },
    async resolveDocument(documentId) {
      const { data, error } = await client.from(DOCUMENTS_TABLE).select("*").eq("id", documentId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        companyId: row.company_id as string,
        sourceId: row.source_id as string,
        title: row.title as string,
        language: row.language as string,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
      } satisfies KnowledgeDocumentSnapshot;
    },
    async resolveSource(sourceId) {
      const { data, error } = await client.from(SOURCES_TABLE).select("*").eq("id", sourceId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        companyId: row.company_id as string,
        key: row.key as string,
        sourceType: row.source_type as string,
        displayName: row.display_name as string,
      } satisfies KnowledgeSourceSnapshot;
    },
    async listAdjacentChunks(documentId, chunkOrder, windowSize) {
      const { data, error } = await client
        .from(CHUNKS_TABLE)
        .select("*")
        .eq("document_id", documentId)
        .gte("chunk_order", chunkOrder - windowSize)
        .lte("chunk_order", chunkOrder + windowSize)
        .is("deleted_at", null)
        .order("chunk_order");
      if (error) throw error;
      return (data ?? []).map((chunk) => {
        const row = chunk as Record<string, unknown>;
        return {
          id: row.id as string,
          companyId: row.company_id as string,
          documentId: row.document_id as string,
          versionId: (row.version_id as string | null) ?? null,
          sectionId: (row.section_id as string | null) ?? null,
          chunkIndex: Number(row.chunk_index),
          chunkOrder: Number(row.chunk_order),
          content: row.content as string,
          tokenCount: Number(row.token_count),
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        } satisfies KnowledgeChunkSnapshot;
      });
    },
  };
}
