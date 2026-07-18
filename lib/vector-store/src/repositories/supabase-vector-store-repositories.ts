import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IndexedVectorNotFoundError,
  VectorCollectionNotFoundError,
  VectorStoreConnectionNotFoundError,
} from "../errors.js";
import type {
  IndexedVectorRepository,
  KnowledgeEmbeddingReader,
  VectorCollectionRepository,
  VectorStoreConnectionRepository,
  VectorStoreDefinitionRepository,
} from "./vector-store-repositories.js";
import type {
  CreateIndexedVectorInput,
  CreateVectorCollectionInput,
  CreateVectorStoreConnectionInput,
  IndexedVectorRecord,
  KnowledgeEmbeddingSnapshot,
  ListIndexedVectorsFilter,
  ListVectorCollectionsFilter,
  ListVectorStoreConnectionsFilter,
  UpdateIndexedVectorInput,
  UpdateVectorCollectionInput,
  UpdateVectorStoreConnectionInput,
  VectorCollectionRecord,
  VectorStoreConnectionRecord,
  VectorStoreDefinitionRecord,
} from "../types.js";
import type { VectorStoreCapability } from "../constants.js";

const DEFINITIONS_TABLE = "vector_store_definitions";
const CONNECTIONS_TABLE = "vector_store_connections";
const COLLECTIONS_TABLE = "vector_collections";
const INDEXED_VECTORS_TABLE = "indexed_vectors";
const EMBEDDINGS_TABLE = "knowledge_embeddings";

const SELECT_WITH_PROVIDER =
  "*, vector_store_definition:vector_store_definitions(id, key, display_name, description, icon, supported_capabilities, configuration_schema, default_configuration, is_active, version, created_at, updated_at)";

function mapDefinition(row: Record<string, unknown>): VectorStoreDefinitionRecord {
  const capabilities = row.supported_capabilities;
  return {
    id: row.id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    icon: (row.icon as string | null) ?? null,
    supported_capabilities: Array.isArray(capabilities) ? (capabilities as VectorStoreCapability[]) : [],
    configuration_schema: (row.configuration_schema as Record<string, unknown>) ?? {},
    default_configuration: (row.default_configuration as Record<string, unknown>) ?? {},
    is_active: Boolean(row.is_active),
    version: row.version as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapConnection(row: Record<string, unknown>): VectorStoreConnectionRecord {
  const embedded = row.vector_store_definition ?? row.vector_store_definitions;
  const providerRow = Array.isArray(embedded) ? embedded[0] : embedded;

  return {
    id: row.id as string,
    company_id: row.company_id as string,
    provider_id: row.provider_id as string,
    display_name: row.display_name as string,
    status: row.status as VectorStoreConnectionRecord["status"],
    configuration: (row.configuration as Record<string, unknown>) ?? {},
    is_default: Boolean(row.is_default),
    is_enabled: Boolean(row.is_enabled),
    health_status: row.health_status as VectorStoreConnectionRecord["health_status"],
    last_health_check: (row.last_health_check as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    vector_store_definition: providerRow ? mapDefinition(providerRow as Record<string, unknown>) : null,
  };
}

function mapCollection(row: Record<string, unknown>): VectorCollectionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    connection_id: row.connection_id as string,
    name: row.name as string,
    provider: row.provider as string,
    embedding_version: Number(row.embedding_version),
    status: row.status as VectorCollectionRecord["status"],
    is_active: Boolean(row.is_active),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapIndexedVector(row: Record<string, unknown>): IndexedVectorRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    knowledge_embedding_id: row.knowledge_embedding_id as string,
    collection_id: row.collection_id as string,
    provider: row.provider as string,
    external_reference: row.external_reference as string,
    status: row.status as IndexedVectorRecord["status"],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    indexed_at: (row.indexed_at as string | null) ?? null,
    removed_at: (row.removed_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function createSupabaseVectorStoreDefinitionRepository(
  client: SupabaseClient,
): VectorStoreDefinitionRepository {
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

export function createSupabaseVectorStoreConnectionRepository(
  client: SupabaseClient,
): VectorStoreConnectionRepository {
  return {
    async create(input: CreateVectorStoreConnectionInput) {
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
    async list(filter: ListVectorStoreConnectionsFilter) {
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
        rows = rows.filter((row) => row.vector_store_definition?.key === filter.providerKey);
      }
      return rows;
    },
    async update(input: UpdateVectorStoreConnectionInput) {
      const existing = await this.findById(input.connectionId);
      if (!existing) throw new VectorStoreConnectionNotFoundError(input.connectionId);

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
      if (input.healthStatus !== undefined) patch.health_status = input.healthStatus;
      if (input.lastHealthCheck !== undefined) patch.last_health_check = input.lastHealthCheck;

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

export function createSupabaseVectorCollectionRepository(client: SupabaseClient): VectorCollectionRepository {
  return {
    async create(input: CreateVectorCollectionInput) {
      const { data, error } = await client
        .from(COLLECTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          connection_id: input.connectionId,
          name: input.name,
          provider: input.provider,
          embedding_version: input.embeddingVersion,
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapCollection(data as Record<string, unknown>);
    },
    async findById(id: string) {
      const { data, error } = await client
        .from(COLLECTIONS_TABLE)
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapCollection(data as Record<string, unknown>) : null;
    },
    async list(filter: ListVectorCollectionsFilter) {
      let query = client
        .from(COLLECTIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (filter.connectionId) query = query.eq("connection_id", filter.connectionId);
      if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapCollection(row as Record<string, unknown>));
    },
    async update(input: UpdateVectorCollectionInput) {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (input.embeddingVersion !== undefined) patch.embedding_version = input.embeddingVersion;

      const { data, error } = await client
        .from(COLLECTIONS_TABLE)
        .update(patch)
        .eq("id", input.collectionId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new VectorCollectionNotFoundError(input.collectionId);
      return mapCollection(data as Record<string, unknown>);
    },
    async softDelete(collectionId: string, deletedBy?: string | null) {
      const { data, error } = await client
        .from(COLLECTIONS_TABLE)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy ?? null,
          status: "archived",
          is_active: false,
        })
        .eq("id", collectionId)
        .select("*")
        .single();

      if (error) throw error;
      return mapCollection(data as Record<string, unknown>);
    },
    async deactivateActive(companyId: string, name: string) {
      const { error } = await client
        .from(COLLECTIONS_TABLE)
        .update({ is_active: false })
        .eq("company_id", companyId)
        .eq("name", name)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (error) throw error;
    },
  };
}

export function createSupabaseIndexedVectorRepository(client: SupabaseClient): IndexedVectorRepository {
  return {
    async create(input: CreateIndexedVectorInput) {
      const { data, error } = await client
        .from(INDEXED_VECTORS_TABLE)
        .insert({
          company_id: input.companyId,
          knowledge_embedding_id: input.knowledgeEmbeddingId,
          collection_id: input.collectionId,
          provider: input.provider,
          external_reference: input.externalReference,
          status: input.status ?? "pending",
          metadata: input.metadata ?? {},
          indexed_at: input.indexedAt ?? null,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapIndexedVector(data as Record<string, unknown>);
    },
    async findById(id: string) {
      const { data, error } = await client.from(INDEXED_VECTORS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapIndexedVector(data as Record<string, unknown>) : null;
    },
    async list(filter: ListIndexedVectorsFilter) {
      let query = client
        .from(INDEXED_VECTORS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("created_at", { ascending: false });

      if (filter.collectionId) query = query.eq("collection_id", filter.collectionId);
      if (filter.knowledgeEmbeddingId) query = query.eq("knowledge_embedding_id", filter.knowledgeEmbeddingId);
      if (filter.status) query = query.eq("status", filter.status);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapIndexedVector(row as Record<string, unknown>));
    },
    async update(input: UpdateIndexedVectorInput) {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.externalReference !== undefined) patch.external_reference = input.externalReference;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (input.indexedAt !== undefined) patch.indexed_at = input.indexedAt;
      if (input.removedAt !== undefined) patch.removed_at = input.removedAt;

      const { data, error } = await client
        .from(INDEXED_VECTORS_TABLE)
        .update(patch)
        .eq("id", input.indexedVectorId)
        .select("*")
        .single();

      if (error) throw error;
      if (!data) throw new IndexedVectorNotFoundError(input.indexedVectorId);
      return mapIndexedVector(data as Record<string, unknown>);
    },
    async findByEmbeddingAndCollection(knowledgeEmbeddingId, collectionId) {
      const { data, error } = await client
        .from(INDEXED_VECTORS_TABLE)
        .select("*")
        .eq("knowledge_embedding_id", knowledgeEmbeddingId)
        .eq("collection_id", collectionId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapIndexedVector(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseKnowledgeEmbeddingReader(client: SupabaseClient): KnowledgeEmbeddingReader {
  return {
    async findById(embeddingId: string): Promise<KnowledgeEmbeddingSnapshot | null> {
      const { data, error } = await client
        .from(EMBEDDINGS_TABLE)
        .select(
          "id, company_id, knowledge_chunk_id, provider, model, dimensions, embedding_version, vector, checksum, is_active, status",
        )
        .eq("id", embeddingId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        company_id: row.company_id as string,
        knowledge_chunk_id: row.knowledge_chunk_id as string,
        provider: row.provider as string,
        model: row.model as string,
        dimensions: Number(row.dimensions),
        embedding_version: Number(row.embedding_version),
        vector: (row.vector as number[]) ?? [],
        checksum: row.checksum as string,
        is_active: Boolean(row.is_active),
        status: row.status as string,
      };
    },
  };
}
