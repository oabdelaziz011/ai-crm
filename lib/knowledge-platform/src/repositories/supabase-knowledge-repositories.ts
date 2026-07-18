import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeChunkRepository,
  KnowledgeDocumentRepository,
  KnowledgeSectionRepository,
  KnowledgeSourceRepository,
  KnowledgeTagRepository,
  KnowledgeVersionRepository,
} from "./knowledge-repositories.js";
import type {
  KnowledgeChunkRecord,
  KnowledgeDocumentRecord,
  KnowledgeDocumentVersionRecord,
  KnowledgeSectionRecord,
  KnowledgeSourceRecord,
  KnowledgeTagRecord,
  ListKnowledgeChunksFilter,
  ListKnowledgeDocumentsFilter,
  ListKnowledgeSectionsFilter,
  ListKnowledgeSourcesFilter,
  ListKnowledgeVersionsFilter,
  ReorderSectionInput,
  SoftDeleteInput,
  UpdateKnowledgeDocumentInput,
  UpdateKnowledgeSectionInput,
  UpdateKnowledgeSourceInput,
} from "../types.js";
import { DEFAULT_CLASSIFICATION, DEFAULT_VISIBILITY, type DocumentStatus, type VersionStatus } from "../constants.js";

const SOURCES_TABLE = "knowledge_sources";
const DOCUMENTS_TABLE = "knowledge_documents";
const VERSIONS_TABLE = "knowledge_document_versions";
const SECTIONS_TABLE = "knowledge_sections";
const TAGS_TABLE = "knowledge_tags";
const CHUNKS_TABLE = "knowledge_chunks";

function mapSource(row: Record<string, unknown>): KnowledgeSourceRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    source_type: row.source_type as KnowledgeSourceRecord["source_type"],
    configuration: (row.configuration as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    is_enabled: Boolean(row.is_enabled),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapDocument(row: Record<string, unknown>): KnowledgeDocumentRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    source_id: row.source_id as string,
    title: row.title as string,
    description: row.description as string,
    language: row.language as string,
    version: Number(row.version ?? row.current_version_number ?? 1),
    current_version_number: Number(row.current_version_number ?? row.version ?? 1),
    published_version_id: (row.published_version_id as string | null) ?? null,
    status: normalizeDocumentStatus(row.status as string),
    checksum: row.checksum as string,
    mime_type: row.mime_type as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    effective_date: (row.effective_date as string | null) ?? null,
    expiration_date: (row.expiration_date as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    classification: (row.classification as string) ?? DEFAULT_CLASSIFICATION,
    visibility: (row.visibility as string) ?? DEFAULT_VISIBILITY,
    retention_policy: (row.retention_policy as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function normalizeDocumentStatus(status: string): DocumentStatus {
  if (status === "active") return "published";
  if (status === "published" || status === "archived" || status === "draft") return status;
  return "draft";
}

function mapVersion(row: Record<string, unknown>): KnowledgeDocumentVersionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    document_id: row.document_id as string,
    version_number: Number(row.version_number ?? 1),
    status: row.status as VersionStatus,
    checksum: row.checksum as string,
    mime_type: row.mime_type as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    is_immutable: Boolean(row.is_immutable),
    published_at: (row.published_at as string | null) ?? null,
    published_by: (row.published_by as string | null) ?? null,
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapSection(row: Record<string, unknown>): KnowledgeSectionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    document_id: row.document_id as string,
    version_id: row.version_id as string,
    parent_section_id: (row.parent_section_id as string | null) ?? null,
    title: row.title as string,
    content: row.content as string,
    section_order: Number(row.section_order ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
  };
}

function mapTag(row: Record<string, unknown>): KnowledgeTagRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    document_id: row.document_id as string,
    tag: row.tag as string,
    created_at: row.created_at as string,
  };
}

function mapChunk(row: Record<string, unknown>): KnowledgeChunkRecord {
  const chunkOrder = Number(row.chunk_order ?? row.chunk_index ?? 0);
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    document_id: row.document_id as string,
    version_id: (row.version_id as string | null) ?? null,
    section_id: (row.section_id as string | null) ?? null,
    chunk_index: Number(row.chunk_index ?? chunkOrder),
    chunk_order: chunkOrder,
    content: row.content as string,
    token_count: Number(row.token_count ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    checksum: row.checksum as string,
    created_at: row.created_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
  };
}

export function createSupabaseKnowledgeSourceRepository(client: SupabaseClient): KnowledgeSourceRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(SOURCES_TABLE)
        .insert({
          company_id: input.companyId,
          key: input.key,
          display_name: input.displayName,
          description: input.description ?? "",
          source_type: input.sourceType,
          configuration: input.configuration ?? {},
          metadata: input.metadata ?? {},
          is_enabled: input.isEnabled ?? true,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSource(data as Record<string, unknown>);
    },
    async update(input) {
      const updates: Record<string, unknown> = {};
      if (input.displayName !== undefined) updates.display_name = input.displayName;
      if (input.description !== undefined) updates.description = input.description;
      if (input.configuration !== undefined) updates.configuration = input.configuration;
      if (input.metadata !== undefined) updates.metadata = input.metadata;
      if (input.isEnabled !== undefined) updates.is_enabled = input.isEnabled;
      const { data, error } = await client.from(SOURCES_TABLE).update(updates).eq("id", input.sourceId).is("deleted_at", null).select("*").single();
      if (error) throw error;
      return mapSource(data as Record<string, unknown>);
    },
    async softDelete(input) {
      const { data, error } = await client
        .from(SOURCES_TABLE)
        .update({ deleted_at: new Date().toISOString(), deleted_by: input.deletedBy ?? null, is_enabled: false })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapSource(data as Record<string, unknown>);
    },
    async findById(id) {
      const { data, error } = await client.from(SOURCES_TABLE).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapSource(data as Record<string, unknown>) : null;
    },
    async findByKey(companyId, key) {
      const { data, error } = await client.from(SOURCES_TABLE).select("*").eq("company_id", companyId).eq("key", key).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapSource(data as Record<string, unknown>) : null;
    },
    async list(filter) {
      let query = client.from(SOURCES_TABLE).select("*").eq("company_id", filter.companyId).is("deleted_at", null).order("created_at", { ascending: false });
      if (filter.sourceType) query = query.eq("source_type", filter.sourceType);
      if (filter.isEnabled !== undefined) query = query.eq("is_enabled", filter.isEnabled);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapSource(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseKnowledgeDocumentRepository(client: SupabaseClient): KnowledgeDocumentRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(DOCUMENTS_TABLE)
        .insert({
          company_id: input.companyId,
          source_id: input.sourceId,
          title: input.title,
          description: input.description ?? "",
          language: input.language ?? "en",
          version: 1,
          current_version_number: 1,
          status: input.status ?? "draft",
          checksum: input.checksum,
          mime_type: input.mimeType ?? "text/plain",
          metadata: input.metadata ?? {},
          effective_date: input.effectiveDate ?? null,
          expiration_date: input.expirationDate ?? null,
          author: input.author ?? null,
          classification: input.classification ?? DEFAULT_CLASSIFICATION,
          visibility: input.visibility ?? DEFAULT_VISIBILITY,
          retention_policy: input.retentionPolicy ?? null,
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapDocument(data as Record<string, unknown>);
    },
    async update(input) {
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.language !== undefined) updates.language = input.language;
      if (input.status !== undefined) updates.status = input.status;
      if (input.checksum !== undefined) updates.checksum = input.checksum;
      if (input.mimeType !== undefined) updates.mime_type = input.mimeType;
      if (input.metadata !== undefined) updates.metadata = input.metadata;
      if (input.effectiveDate !== undefined) updates.effective_date = input.effectiveDate;
      if (input.expirationDate !== undefined) updates.expiration_date = input.expirationDate;
      if (input.author !== undefined) updates.author = input.author;
      if (input.classification !== undefined) updates.classification = input.classification;
      if (input.visibility !== undefined) updates.visibility = input.visibility;
      if (input.retentionPolicy !== undefined) updates.retention_policy = input.retentionPolicy;
      if (input.publishedVersionId !== undefined) updates.published_version_id = input.publishedVersionId;
      if (input.currentVersionNumber !== undefined) {
        updates.current_version_number = input.currentVersionNumber;
        updates.version = input.currentVersionNumber;
      }
      const { data, error } = await client.from(DOCUMENTS_TABLE).update(updates).eq("id", input.documentId).is("deleted_at", null).select("*").single();
      if (error) throw error;
      return mapDocument(data as Record<string, unknown>);
    },
    async softDelete(input) {
      const { data, error } = await client
        .from(DOCUMENTS_TABLE)
        .update({ deleted_at: new Date().toISOString(), deleted_by: input.deletedBy ?? null, status: "archived" })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapDocument(data as Record<string, unknown>);
    },
    async findById(id) {
      const { data, error } = await client.from(DOCUMENTS_TABLE).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data as Record<string, unknown>) : null;
    },
    async list(filter) {
      let query = client.from(DOCUMENTS_TABLE).select("*").eq("company_id", filter.companyId).is("deleted_at", null).order("updated_at", { ascending: false });
      if (filter.sourceId) query = query.eq("source_id", filter.sourceId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapDocument(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseKnowledgeVersionRepository(client: SupabaseClient): KnowledgeVersionRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .insert({
          company_id: input.companyId,
          document_id: input.documentId,
          version_number: input.versionNumber,
          checksum: input.checksum,
          mime_type: input.mimeType ?? "text/plain",
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapVersion(data as Record<string, unknown>);
    },
    async publish(versionId, publishedBy) {
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .update({ status: "published", is_immutable: true, published_at: new Date().toISOString(), published_by: publishedBy ?? null })
        .eq("id", versionId)
        .select("*")
        .single();
      if (error) throw error;
      return mapVersion(data as Record<string, unknown>);
    },
    async archive(versionId) {
      const { data, error } = await client.from(VERSIONS_TABLE).update({ status: "archived" }).eq("id", versionId).select("*").single();
      if (error) throw error;
      return mapVersion(data as Record<string, unknown>);
    },
    async findById(id) {
      const { data, error } = await client.from(VERSIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapVersion(data as Record<string, unknown>) : null;
    },
    async findByDocumentAndNumber(documentId, versionNumber) {
      const { data, error } = await client.from(VERSIONS_TABLE).select("*").eq("document_id", documentId).eq("version_number", versionNumber).maybeSingle();
      if (error) throw error;
      return data ? mapVersion(data as Record<string, unknown>) : null;
    },
    async list(filter) {
      const { data, error } = await client
        .from(VERSIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .eq("document_id", filter.documentId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapVersion(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseKnowledgeSectionRepository(client: SupabaseClient): KnowledgeSectionRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(SECTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          document_id: input.documentId,
          version_id: input.versionId,
          parent_section_id: input.parentSectionId ?? null,
          title: input.title,
          content: input.content ?? "",
          section_order: input.sectionOrder,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSection(data as Record<string, unknown>);
    },
    async update(input) {
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.content !== undefined) updates.content = input.content;
      if (input.sectionOrder !== undefined) updates.section_order = input.sectionOrder;
      if (input.parentSectionId !== undefined) updates.parent_section_id = input.parentSectionId;
      if (input.metadata !== undefined) updates.metadata = input.metadata;
      const { data, error } = await client.from(SECTIONS_TABLE).update(updates).eq("id", input.sectionId).is("deleted_at", null).select("*").single();
      if (error) throw error;
      return mapSection(data as Record<string, unknown>);
    },
    async reorder(input) {
      const { data, error } = await client.from(SECTIONS_TABLE).update({ section_order: input.sectionOrder }).eq("id", input.sectionId).select("*").single();
      if (error) throw error;
      return mapSection(data as Record<string, unknown>);
    },
    async softDelete(input) {
      const { data, error } = await client
        .from(SECTIONS_TABLE)
        .update({ deleted_at: new Date().toISOString(), deleted_by: input.deletedBy ?? null })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapSection(data as Record<string, unknown>);
    },
    async findById(id) {
      const { data, error } = await client.from(SECTIONS_TABLE).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapSection(data as Record<string, unknown>) : null;
    },
    async list(filter) {
      const { data, error } = await client
        .from(SECTIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .eq("document_id", filter.documentId)
        .eq("version_id", filter.versionId)
        .is("deleted_at", null)
        .order("section_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapSection(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseKnowledgeTagRepository(client: SupabaseClient): KnowledgeTagRepository {
  return {
    async setTags(companyId, documentId, tags) {
      await client.from(TAGS_TABLE).delete().eq("document_id", documentId);
      if (tags.length === 0) return [];
      const { data, error } = await client
        .from(TAGS_TABLE)
        .insert(tags.map((tag) => ({ company_id: companyId, document_id: documentId, tag })))
        .select("*");
      if (error) throw error;
      return (data ?? []).map((row) => mapTag(row as Record<string, unknown>));
    },
    async listByDocument(documentId) {
      const { data, error } = await client.from(TAGS_TABLE).select("*").eq("document_id", documentId).order("tag", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapTag(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseKnowledgeChunkRepository(client: SupabaseClient): KnowledgeChunkRepository {
  return {
    async createMany(inputs) {
      if (inputs.length === 0) return [];
      const { data, error } = await client
        .from(CHUNKS_TABLE)
        .insert(
          inputs.map((input) => ({
            company_id: input.companyId,
            document_id: input.documentId,
            version_id: input.versionId,
            section_id: input.sectionId ?? null,
            chunk_index: input.chunkOrder,
            chunk_order: input.chunkOrder,
            content: input.content,
            token_count: input.tokenCount,
            checksum: input.checksum,
            metadata: input.metadata ?? {},
          })),
        )
        .select("*");
      if (error) throw error;
      return (data ?? []).map((row) => mapChunk(row as Record<string, unknown>));
    },
    async softDeleteByVersion(versionId, deletedBy) {
      const { data, error } = await client
        .from(CHUNKS_TABLE)
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy ?? null })
        .eq("version_id", versionId)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    async list(filter) {
      let query = client
        .from(CHUNKS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .eq("document_id", filter.documentId)
        .is("deleted_at", null)
        .order("chunk_order", { ascending: true });
      if (filter.versionId) query = query.eq("version_id", filter.versionId);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapChunk(row as Record<string, unknown>));
    },
  };
}
