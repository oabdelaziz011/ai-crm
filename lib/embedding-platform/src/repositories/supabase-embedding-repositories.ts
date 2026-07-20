import type { SupabaseClient } from "@supabase/supabase-js";
import { EmbeddingProviderConnectionNotFoundError, EmbeddingJobNotFoundError, EmbeddingNotFoundError } from "../errors.js";
import type {
  EmbeddingJobRepository,
  EmbeddingProviderConnectionRepository,
  EmbeddingProviderDefinitionRepository,
  KnowledgeChunkReader,
  KnowledgeEmbeddingRepository,
} from "./embedding-repositories.js";
import type {
  CreateEmbeddingJobInput,
  CreateEmbeddingProviderConnectionInput,
  CreateKnowledgeEmbeddingInput,
  EmbeddingJobRecord,
  EmbeddingProviderConnectionRecord,
  EmbeddingProviderDefinitionRecord,
  KnowledgeChunkSnapshot,
  KnowledgeEmbeddingRecord,
  ListEmbeddingJobsFilter,
  ListEmbeddingJobsByChunkIdsFilter,
  ListEmbeddingJobsByDocumentFilter,
  ListEmbeddingProviderConnectionsFilter,
  ListKnowledgeEmbeddingsFilter,
  UpdateEmbeddingJobInput,
  UpdateEmbeddingProviderConnectionInput,
  UpdateKnowledgeEmbeddingInput,
} from "../types.js";

const DEFINITIONS_TABLE = "embedding_provider_definitions";
const CONNECTIONS_TABLE = "embedding_provider_connections";
const EMBEDDINGS_TABLE = "knowledge_embeddings";
const JOBS_TABLE = "embedding_jobs";
const CHUNKS_TABLE = "knowledge_chunks";

const SELECT_WITH_PROVIDER =
  "*, embedding_provider_definition:embedding_provider_definitions(id, key, display_name, description, icon, default_model, default_dimensions, configuration_schema, default_configuration, is_active, version, created_at, updated_at)";

function mapDefinition(row: Record<string, unknown>): EmbeddingProviderDefinitionRecord {
  return {
    id: row.id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    icon: (row.icon as string | null) ?? null,
    default_model: row.default_model as string,
    default_dimensions: Number(row.default_dimensions),
    configuration_schema: (row.configuration_schema as Record<string, unknown>) ?? {},
    default_configuration: (row.default_configuration as Record<string, unknown>) ?? {},
    is_active: Boolean(row.is_active),
    version: row.version as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapConnection(row: Record<string, unknown>): EmbeddingProviderConnectionRecord {
  const embedded = row.embedding_provider_definition ?? row.embedding_provider_definitions;
  const providerRow = Array.isArray(embedded) ? embedded[0] : embedded;

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    provider_id: row.provider_id as string,
    display_name: row.display_name as string,
    status: row.status as EmbeddingProviderConnectionRecord["status"],
    configuration: (row.configuration as Record<string, unknown>) ?? {},
    is_default: Boolean(row.is_default),
    is_enabled: Boolean(row.is_enabled),
    health_status: row.health_status as EmbeddingProviderConnectionRecord["health_status"],
    last_health_check: (row.last_health_check as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    embedding_provider_definition: providerRow ? mapDefinition(providerRow as Record<string, unknown>) : null,
  };
}

function mapEmbedding(row: Record<string, unknown>): KnowledgeEmbeddingRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    knowledge_chunk_id: row.knowledge_chunk_id as string,
    connection_id: row.connection_id as string,
    provider: row.provider as string,
    model: row.model as string,
    dimensions: Number(row.dimensions),
    embedding_version: Number(row.embedding_version),
    vector: (row.vector as number[]) ?? [],
    checksum: row.checksum as string,
    status: row.status as KnowledgeEmbeddingRecord["status"],
    is_active: Boolean(row.is_active),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    activated_at: (row.activated_at as string | null) ?? null,
    superseded_at: (row.superseded_at as string | null) ?? null,
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapJob(row: Record<string, unknown>): EmbeddingJobRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    knowledge_chunk_id: row.knowledge_chunk_id as string,
    connection_id: row.connection_id as string,
    provider: row.provider as string,
    model: row.model as string,
    embedding_version: Number(row.embedding_version),
    status: row.status as EmbeddingJobRecord["status"],
    retry_count: Number(row.retry_count),
    max_retries: Number(row.max_retries),
    error_message: (row.error_message as string | null) ?? null,
    result_embedding_id: (row.result_embedding_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    queued_at: row.queued_at as string,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    locked_by: (row.locked_by as string | null) ?? null,
    locked_at: (row.locked_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function createSupabaseEmbeddingProviderDefinitionRepository(
  client: SupabaseClient,
): EmbeddingProviderDefinitionRepository {
  return {
    async listActive() {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async listAll() {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async findById(id: string) {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapDefinition(data as Record<string, unknown>) : null;
    },

    async findByKey(key: string) {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("key", key).maybeSingle();
      if (error) throw error;
      return data ? mapDefinition(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseEmbeddingProviderConnectionRepository(
  client: SupabaseClient,
): EmbeddingProviderConnectionRepository {
  return {
    async create(input: CreateEmbeddingProviderConnectionInput) {
      if (input.isDefault) {
        await client
          .from(CONNECTIONS_TABLE)
          .update({ is_default: false })
          .eq("company_id", input.companyId)
          .is("deleted_at", null);
      }

      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          provider_id: input.providerId,
          display_name: input.displayName,
          configuration: input.configuration ?? {},
          is_default: input.isDefault ?? false,
          is_enabled: input.isEnabled ?? false,
          status: input.status ?? "pending",
          health_status: input.healthStatus ?? "unknown",
        })
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },

    async findById(id: string) {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .select(SELECT_WITH_PROVIDER)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapConnection(data as Record<string, unknown>) : null;
    },

    async list(filter: ListEmbeddingProviderConnectionsFilter) {
      let query = client
        .from(CONNECTIONS_TABLE)
        .select(SELECT_WITH_PROVIDER)
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });

      if (filter.isEnabled !== undefined) query = query.eq("is_enabled", filter.isEnabled);
      if (filter.healthStatus) query = query.eq("health_status", filter.healthStatus);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []).map((row) => mapConnection(row as Record<string, unknown>));
      if (filter.providerKey) {
        rows = rows.filter((row) => row.embedding_provider_definition?.key === filter.providerKey);
      }
      return rows;
    },

    async update(input: UpdateEmbeddingProviderConnectionInput) {
      const existing = await this.findById(input.connectionId);
      if (!existing) throw new EmbeddingProviderConnectionNotFoundError(input.connectionId);

      if (input.isDefault) {
        await client
          .from(CONNECTIONS_TABLE)
          .update({ is_default: false })
          .eq("company_id", existing.company_id)
          .is("deleted_at", null);
      }

      const patch: Record<string, unknown> = {};
      if (input.configuration !== undefined) patch.configuration = input.configuration;
      if (input.displayName !== undefined) patch.display_name = input.displayName;
      if (input.status !== undefined) patch.status = input.status;
      if (input.isEnabled !== undefined) patch.is_enabled = input.isEnabled;
      if (input.isDefault !== undefined) patch.is_default = input.isDefault;

      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .update(patch)
        .eq("id", input.connectionId)
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },

    async softDelete(connectionId: string, deletedBy?: string | null) {
      const { data, error } = await client
        .from(CONNECTIONS_TABLE)
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy ?? null, is_enabled: false })
        .eq("id", connectionId)
        .select(SELECT_WITH_PROVIDER)
        .single();

      if (error) throw error;
      return mapConnection(data as Record<string, unknown>);
    },
  };
}

export function createSupabaseKnowledgeEmbeddingRepository(client: SupabaseClient): KnowledgeEmbeddingRepository {
  return {
    async create(input: CreateKnowledgeEmbeddingInput) {
      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .insert({
          company_id: input.companyId,
          knowledge_chunk_id: input.knowledgeChunkId,
          connection_id: input.connectionId,
          provider: input.provider,
          model: input.model,
          dimensions: input.dimensions,
          embedding_version: input.embeddingVersion,
          vector: input.vector,
          checksum: input.checksum,
          status: input.status ?? "pending",
          is_active: input.isActive ?? false,
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapEmbedding(data as Record<string, unknown>);
    },

    async findById(id: string) {
      const { data, error } = await client.from(EMBEDDINGS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapEmbedding(data as Record<string, unknown>) : null;
    },

    async list(filter: ListKnowledgeEmbeddingsFilter) {
      let query = client.from(EMBEDDINGS_TABLE).select("*").eq("company_id", filter.companyId).order("created_at", { ascending: false });
      if (filter.knowledgeChunkId) query = query.eq("knowledge_chunk_id", filter.knowledgeChunkId);
      if (filter.provider) query = query.eq("provider", filter.provider);
      if (filter.model) query = query.eq("model", filter.model);
      if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapEmbedding(row as Record<string, unknown>));
    },

    async update(input: UpdateKnowledgeEmbeddingInput) {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (input.activatedAt !== undefined) patch.activated_at = input.activatedAt;
      if (input.supersededAt !== undefined) patch.superseded_at = input.supersededAt;

      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .update(patch)
        .eq("id", input.embeddingId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new EmbeddingNotFoundError(input.embeddingId);
      return mapEmbedding(data as Record<string, unknown>);
    },

    async findActive(knowledgeChunkId, provider, model) {
      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .select("*")
        .eq("knowledge_chunk_id", knowledgeChunkId)
        .eq("provider", provider)
        .eq("model", model)
        .eq("is_active", true)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;
      return data ? mapEmbedding(data as Record<string, unknown>) : null;
    },

    async getLatestVersion(knowledgeChunkId, provider, model) {
      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .select("embedding_version")
        .eq("knowledge_chunk_id", knowledgeChunkId)
        .eq("provider", provider)
        .eq("model", model)
        .order("embedding_version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? Number((data as Record<string, unknown>).embedding_version) : 0;
    },

    async deactivateActive(knowledgeChunkId, provider, model) {
      const { error } = await client
        .from(EMBEDDINGS_TABLE)
        .update({
          is_active: false,
          status: "superseded",
          superseded_at: new Date().toISOString(),
        })
        .eq("knowledge_chunk_id", knowledgeChunkId)
        .eq("provider", provider)
        .eq("model", model)
        .eq("is_active", true);

      if (error) throw error;
    },
  };
}

export function createSupabaseEmbeddingJobRepository(client: SupabaseClient): EmbeddingJobRepository {
  return {
    async create(input: CreateEmbeddingJobInput) {
      const { data, error } = await client
        .from(JOBS_TABLE)
        .insert({
          company_id: input.companyId,
          knowledge_chunk_id: input.knowledgeChunkId,
          connection_id: input.connectionId,
          provider: input.provider,
          model: input.model,
          embedding_version: input.embeddingVersion,
          max_retries: input.maxRetries ?? 3,
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapJob(data as Record<string, unknown>);
    },

    async createMany(inputs: CreateEmbeddingJobInput[]) {
      if (inputs.length === 0) return [];

      const rows = inputs.map((input) => ({
        company_id: input.companyId,
        knowledge_chunk_id: input.knowledgeChunkId,
        connection_id: input.connectionId,
        provider: input.provider,
        model: input.model,
        embedding_version: input.embeddingVersion,
        max_retries: input.maxRetries ?? 3,
        metadata: input.metadata ?? {},
        created_by: input.createdBy ?? null,
      }));

      const { data, error } = await client.from(JOBS_TABLE).insert(rows).select("*");
      if (error) throw error;
      return (data ?? []).map((row) => mapJob(row as Record<string, unknown>));
    },

    async findById(id: string) {
      const { data, error } = await client.from(JOBS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapJob(data as Record<string, unknown>) : null;
    },

    async list(filter: ListEmbeddingJobsFilter) {
      let query = client.from(JOBS_TABLE).select("*").eq("company_id", filter.companyId).order("queued_at", { ascending: true });
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.knowledgeChunkId) query = query.eq("knowledge_chunk_id", filter.knowledgeChunkId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapJob(row as Record<string, unknown>));
    },

    async listByChunkIds(filter: ListEmbeddingJobsByChunkIdsFilter) {
      if (filter.chunkIds.length === 0) return [];

      let query = client
        .from(JOBS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .in("knowledge_chunk_id", filter.chunkIds)
        .order("queued_at", { ascending: true });

      if (filter.statuses?.length) {
        query = query.in("status", filter.statuses);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapJob(row as Record<string, unknown>));
    },

    async listByDocumentVersion(filter: ListEmbeddingJobsByDocumentFilter) {
      const { data, error } = await client
        .from(JOBS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .eq("metadata->>documentId", filter.documentId)
        .eq("metadata->>versionId", filter.versionId)
        .order("queued_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapJob(row as Record<string, unknown>));
    },

    async update(input: UpdateEmbeddingJobInput) {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.retryCount !== undefined) patch.retry_count = input.retryCount;
      if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
      if (input.resultEmbeddingId !== undefined) patch.result_embedding_id = input.resultEmbeddingId;
      if (input.startedAt !== undefined) patch.started_at = input.startedAt;
      if (input.completedAt !== undefined) patch.completed_at = input.completedAt;
      if (input.cancelledAt !== undefined) patch.cancelled_at = input.cancelledAt;
      if (input.lockedBy !== undefined) patch.locked_by = input.lockedBy;
      if (input.lockedAt !== undefined) patch.locked_at = input.lockedAt;

      const { data, error } = await client.from(JOBS_TABLE).update(patch).eq("id", input.jobId).select("*").single();
      if (error) throw error;
      if (!data) throw new EmbeddingJobNotFoundError(input.jobId);
      return mapJob(data as Record<string, unknown>);
    },

    async claimNextQueued(companyId: string, workerId?: string | null) {
      const batch = await this.claimNextQueuedBatch(companyId, 1, workerId);
      return batch[0] ?? null;
    },

    async claimNextQueuedBatch(companyId: string, limit: number, workerId?: string | null) {
      const { data, error } = await client.rpc("claim_embedding_jobs", {
        p_company_id: companyId,
        p_limit: limit,
        p_worker_id: workerId ?? null,
      });

      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => mapJob(row));
    },

    async recoverStaleLocks(staleSeconds = 900) {
      const { data, error } = await client.rpc("recover_stale_embedding_jobs", {
        p_stale_seconds: staleSeconds,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  };
}

export function createSupabaseKnowledgeChunkReader(client: SupabaseClient): KnowledgeChunkReader {
  return {
    async findById(chunkId: string): Promise<KnowledgeChunkSnapshot | null> {
      const { data, error } = await client
        .from(CHUNKS_TABLE)
        .select("id, company_id, content, checksum")
        .eq("id", chunkId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        company_id: row.company_id as string,
        content: row.content as string,
        checksum: row.checksum as string,
      };
    },

    async listByVersion(companyId: string, versionId: string): Promise<KnowledgeChunkSnapshot[]> {
      const { data, error } = await client
        .from(CHUNKS_TABLE)
        .select("id, company_id, content, checksum")
        .eq("company_id", companyId)
        .eq("version_id", versionId)
        .is("deleted_at", null)
        .order("chunk_order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: record.id as string,
          company_id: record.company_id as string,
          content: record.content as string,
          checksum: record.checksum as string,
        };
      });
    },
  };
}
