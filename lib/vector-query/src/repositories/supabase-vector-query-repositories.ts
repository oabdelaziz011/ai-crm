import type { SupabaseClient } from "@supabase/supabase-js";
import {
  QueryExecutionNotFoundError,
  SearchPolicyNotFoundError,
} from "../errors/error-catalog.js";
import type {
  IndexedVectorReadRepository,
  QueryExecutionRepository,
  QueryResultRepository,
  SearchPolicyRepository,
  VectorStoreConnectionReader,
  VectorStoreDefinitionReader,
} from "./vector-query-repositories.js";
import type {
  CreateQueryExecutionInput,
  CreateQueryResultInput,
  CreateSearchPolicyInput,
  IndexedVectorSnapshot,
  KnowledgeEmbeddingSnapshot,
  UpdateSearchPolicyInput,
  VectorCollectionSnapshot,
  VectorQueryExecutionRecord,
  VectorQueryResultRecord,
  VectorSearchPolicyRecord,
  VectorStoreConnectionSnapshot,
} from "../types.js";

const POLICIES_TABLE = "vector_search_policies";
const EXECUTIONS_TABLE = "vector_query_executions";
const RESULTS_TABLE = "vector_query_results";
const DEFINITIONS_TABLE = "vector_store_definitions";
const CONNECTIONS_TABLE = "vector_store_connections";
const COLLECTIONS_TABLE = "vector_collections";
const EMBEDDINGS_TABLE = "knowledge_embeddings";
const INDEXED_VECTORS_TABLE = "indexed_vectors";

function mapPolicy(row: Record<string, unknown>): VectorSearchPolicyRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    policy_name: row.policy_name as string,
    default_top_k: Number(row.default_top_k),
    minimum_similarity_score: Number(row.minimum_similarity_score),
    maximum_results: Number(row.maximum_results),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    is_default: Boolean(row.is_default),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExecution(row: Record<string, unknown>): VectorQueryExecutionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    vector_store_connection_id: row.vector_store_connection_id as string,
    collection_id: row.collection_id as string,
    embedding_id: (row.embedding_id as string | null) ?? null,
    policy_id: (row.policy_id as string | null) ?? null,
    query_checksum: row.query_checksum as string,
    execution_status: row.execution_status as VectorQueryExecutionRecord["execution_status"],
    execution_time_ms: row.execution_time_ms == null ? null : Number(row.execution_time_ms),
    provider: row.provider as string,
    result_count: Number(row.result_count),
    correlation_id: (row.correlation_id as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapResult(row: Record<string, unknown>): VectorQueryResultRecord {
  return {
    id: row.id as string,
    execution_id: row.execution_id as string,
    indexed_vector_id: row.indexed_vector_id as string,
    normalized_score: Number(row.normalized_score),
    provider_score: row.provider_score == null ? null : Number(row.provider_score),
    ranking: Number(row.ranking),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

function isArchivedPolicy(record: VectorSearchPolicyRecord): boolean {
  return record.metadata.archived === true;
}

export function createSupabaseVectorStoreDefinitionReader(client: SupabaseClient): VectorStoreDefinitionReader {
  return {
    async findByKey(key: string) {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("key", key).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        key: row.key as string,
        default_configuration: (row.default_configuration as Record<string, unknown>) ?? {},
        configuration_schema: (row.configuration_schema as Record<string, unknown>) ?? {},
        is_active: Boolean(row.is_active),
      };
    },
  };
}

export function createSupabaseSearchPolicyRepository(client: SupabaseClient): SearchPolicyRepository {
  return {
    async findByCompany(companyId: string) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .order("policy_name", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((row) => mapPolicy(row as Record<string, unknown>))
        .filter((record) => !isArchivedPolicy(record));
    },
    async create(input: CreateSearchPolicyInput) {
      if (input.isDefault) {
        await client.from(POLICIES_TABLE).update({ is_default: false }).eq("company_id", input.companyId);
      }

      const { data, error } = await client
        .from(POLICIES_TABLE)
        .insert({
          company_id: input.companyId,
          policy_name: input.policyName,
          default_top_k: input.defaultTopK,
          minimum_similarity_score: input.minimumSimilarityScore,
          maximum_results: input.maximumResults,
          metadata: input.metadata ?? {},
          is_default: input.isDefault ?? false,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapPolicy(data as Record<string, unknown>);
    },
    async findById(id: string) {
      const { data, error } = await client.from(POLICIES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapPolicy(data as Record<string, unknown>) : null;
    },
    async findDefault(companyId: string) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      const record = data ? mapPolicy(data as Record<string, unknown>) : null;
      return record && !isArchivedPolicy(record) ? record : null;
    },
    async update(input: UpdateSearchPolicyInput) {
      if (input.isDefault) {
        const existing = await this.findById(input.policyId);
        if (existing) {
          await client.from(POLICIES_TABLE).update({ is_default: false }).eq("company_id", existing.company_id);
        }
      }

      const patch: Record<string, unknown> = {};
      if (input.policyName !== undefined) patch.policy_name = input.policyName;
      if (input.defaultTopK !== undefined) patch.default_top_k = input.defaultTopK;
      if (input.minimumSimilarityScore !== undefined) patch.minimum_similarity_score = input.minimumSimilarityScore;
      if (input.maximumResults !== undefined) patch.maximum_results = input.maximumResults;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (input.isDefault !== undefined) patch.is_default = input.isDefault;

      const { data, error } = await client
        .from(POLICIES_TABLE)
        .update(patch)
        .eq("id", input.policyId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new SearchPolicyNotFoundError(input.policyId);
      return mapPolicy(data as Record<string, unknown>);
    },
    async archive(policyId: string) {
      const existing = await this.findById(policyId);
      if (!existing) throw new SearchPolicyNotFoundError(policyId);

      const { data, error } = await client
        .from(POLICIES_TABLE)
        .update({
          is_default: false,
          metadata: { ...existing.metadata, archived: true, archived_at: new Date().toISOString() },
        })
        .eq("id", policyId)
        .select("*")
        .single();

      if (error) throw error;
      return mapPolicy(data as Record<string, unknown>);
    },
  };
}

export function createSupabaseQueryExecutionRepository(client: SupabaseClient): QueryExecutionRepository {
  return {
    async createExecution(input: CreateQueryExecutionInput) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          vector_store_connection_id: input.vectorStoreConnectionId,
          collection_id: input.collectionId,
          embedding_id: input.embeddingId ?? null,
          policy_id: input.policyId ?? null,
          query_checksum: input.queryChecksum,
          execution_status: "running",
          provider: input.provider,
          correlation_id: input.correlationId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },
    async findExecution(id: string) {
      const { data, error } = await client.from(EXECUTIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapExecution(data as Record<string, unknown>) : null;
    },
    async updateStatus(executionId, status) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ execution_status: status })
        .eq("id", executionId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new QueryExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async completeExecution(executionId, input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          execution_status: "completed",
          execution_time_ms: input.executionTimeMs,
          result_count: input.resultCount,
          metadata: input.metadata,
        })
        .eq("id", executionId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new QueryExecutionNotFoundError(executionId);
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
      if (!data) throw new QueryExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async findByCompany(companyId: string) {
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

export function createSupabaseQueryResultRepository(client: SupabaseClient): QueryResultRepository {
  return {
    async saveResults(inputs) {
      if (inputs.length === 0) return [];

      const { data, error } = await client
        .from(RESULTS_TABLE)
        .insert(
          inputs.map((input) => ({
            execution_id: input.executionId,
            indexed_vector_id: input.indexedVectorId,
            normalized_score: input.normalizedScore,
            provider_score: input.providerScore ?? null,
            ranking: input.ranking,
            metadata: input.metadata ?? {},
          })),
        )
        .select("*");

      if (error) throw error;
      return (data ?? []).map((row) => mapResult(row as Record<string, unknown>));
    },
    async removeResults(executionId: string) {
      const { error } = await client.from(RESULTS_TABLE).delete().eq("execution_id", executionId);
      if (error) throw error;
    },
    async listExecutionResults(executionId: string) {
      const { data, error } = await client
        .from(RESULTS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .order("ranking", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapResult(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseIndexedVectorReadRepository(client: SupabaseClient): IndexedVectorReadRepository {
  return {
    async resolveIndexedVector(collectionId, knowledgeEmbeddingId) {
      const { data, error } = await client
        .from(INDEXED_VECTORS_TABLE)
        .select("*")
        .eq("collection_id", collectionId)
        .eq("knowledge_embedding_id", knowledgeEmbeddingId)
        .eq("status", "indexed")
        .maybeSingle();

      if (error) throw error;
      return data ? mapIndexedVector(data as Record<string, unknown>) : null;
    },
    async resolveCollection(collectionId: string) {
      const { data, error } = await client
        .from(COLLECTIONS_TABLE)
        .select("id, company_id, connection_id, name, provider, embedding_version, is_active")
        .eq("id", collectionId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        company_id: row.company_id as string,
        connection_id: row.connection_id as string,
        name: row.name as string,
        provider: row.provider as string,
        embedding_version: Number(row.embedding_version),
        is_active: Boolean(row.is_active),
      } satisfies VectorCollectionSnapshot;
    },
    async resolveEmbedding(embeddingId: string) {
      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .select("id, company_id, vector, is_active, status")
        .eq("id", embeddingId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        company_id: row.company_id as string,
        vector: (row.vector as number[]) ?? [],
        is_active: Boolean(row.is_active),
        status: row.status as string,
      } satisfies KnowledgeEmbeddingSnapshot;
    },
  };
}

export function createSupabaseVectorStoreConnectionReader(client: SupabaseClient): VectorStoreConnectionReader {
  return {
    async findById(connectionId: string): Promise<VectorStoreConnectionSnapshot | null> {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .select("id, company_id, configuration, is_enabled, provider_id, vector_store_definition:vector_store_definitions(key)")
        .eq("id", connectionId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      const embedded = row.vector_store_definition ?? row.vector_store_definitions;
      const providerRow = Array.isArray(embedded) ? embedded[0] : embedded;

      return {
        id: row.id as string,
        company_id: row.company_id as string,
        provider_key: (providerRow as Record<string, unknown> | null)?.key as string,
        configuration: (row.configuration as Record<string, unknown>) ?? {},
        is_enabled: Boolean(row.is_enabled),
      };
    },
  };
}

function mapIndexedVector(row: Record<string, unknown>): IndexedVectorSnapshot {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    collection_id: row.collection_id as string,
    knowledge_embedding_id: row.knowledge_embedding_id as string,
    provider: row.provider as string,
    external_reference: row.external_reference as string,
    status: row.status as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

/** @deprecated Use createSupabaseIndexedVectorReadRepository */
export const createSupabaseIndexedVectorReader = createSupabaseIndexedVectorReadRepository;
/** @deprecated Use createSupabaseIndexedVectorReadRepository */
export const createSupabaseKnowledgeEmbeddingReader = createSupabaseIndexedVectorReadRepository;
/** @deprecated Use createSupabaseIndexedVectorReadRepository */
export const createSupabaseVectorCollectionReader = createSupabaseIndexedVectorReadRepository;
