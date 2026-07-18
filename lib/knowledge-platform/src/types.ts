import type { DocumentStatus, KnowledgeSourceType, VersionStatus } from "./constants.js";

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type KnowledgeSourceRecord = {
  id: string;
  company_id: string;
  key: string;
  display_name: string;
  description: string;
  source_type: KnowledgeSourceType;
  configuration: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string | null;
};

export type KnowledgeDocumentRecord = {
  id: string;
  company_id: string;
  source_id: string;
  title: string;
  description: string;
  language: string;
  version: number;
  current_version_number: number;
  published_version_id: string | null;
  status: DocumentStatus;
  checksum: string;
  mime_type: string;
  metadata: Record<string, unknown>;
  effective_date: string | null;
  expiration_date: string | null;
  author: string | null;
  classification: string;
  visibility: string;
  retention_policy: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string | null;
};

export type KnowledgeDocumentVersionRecord = {
  id: string;
  company_id: string;
  document_id: string;
  version_number: number;
  status: VersionStatus;
  checksum: string;
  mime_type: string;
  metadata: Record<string, unknown>;
  is_immutable: boolean;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  created_by: string | null;
};

export type KnowledgeSectionRecord = {
  id: string;
  company_id: string;
  document_id: string;
  version_id: string;
  parent_section_id: string | null;
  title: string;
  content: string;
  section_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type KnowledgeTagRecord = {
  id: string;
  company_id: string;
  document_id: string;
  tag: string;
  created_at: string;
};

export type KnowledgeChunkRecord = {
  id: string;
  company_id: string;
  document_id: string;
  version_id: string | null;
  section_id: string | null;
  chunk_index: number;
  chunk_order: number;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
  checksum: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type CreateKnowledgeSourceInput = {
  companyId: string;
  key: string;
  displayName: string;
  description?: string;
  sourceType: KnowledgeSourceType;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isEnabled?: boolean;
  createdBy?: string | null;
};

export type UpdateKnowledgeSourceInput = {
  sourceId: string;
  displayName?: string;
  description?: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isEnabled?: boolean;
};

export type CreateKnowledgeDocumentInput = {
  companyId: string;
  sourceId: string;
  title: string;
  description?: string;
  language?: string;
  status?: DocumentStatus;
  checksum: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  author?: string | null;
  classification?: string;
  visibility?: string;
  retentionPolicy?: string | null;
  createdBy?: string | null;
};

export type UpdateKnowledgeDocumentInput = {
  documentId: string;
  title?: string;
  description?: string;
  language?: string;
  status?: DocumentStatus;
  checksum?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  author?: string | null;
  classification?: string;
  visibility?: string;
  retentionPolicy?: string | null;
  publishedVersionId?: string | null;
  currentVersionNumber?: number;
};

export type CreateKnowledgeVersionInput = {
  companyId: string;
  documentId: string;
  versionNumber: number;
  checksum: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type CreateKnowledgeSectionInput = {
  companyId: string;
  documentId: string;
  versionId: string;
  parentSectionId?: string | null;
  title: string;
  content?: string;
  sectionOrder: number;
  metadata?: Record<string, unknown>;
};

export type UpdateKnowledgeSectionInput = {
  sectionId: string;
  title?: string;
  content?: string;
  sectionOrder?: number;
  parentSectionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateKnowledgeChunkInput = {
  companyId: string;
  documentId: string;
  versionId: string;
  sectionId?: string | null;
  chunkOrder: number;
  content: string;
  tokenCount: number;
  checksum: string;
  metadata?: Record<string, unknown>;
};

export type ContentEncoding = "text" | "base64";

export type ParserInput = {
  content: string;
  mimeType: string;
  title?: string;
  contentEncoding?: ContentEncoding;
  fileName?: string;
};

export type ImportDocumentInput = {
  companyId: string;
  sourceId: string;
  title: string;
  description?: string;
  language?: string;
  mimeType?: string;
  rawContent: string;
  contentEncoding?: ContentEncoding;
  fileName?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
};

export type ParsedPage = {
  pageNumber: number;
  title?: string;
  text: string;
};

export type ParsedDocument = {
  title: string;
  text: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
  pages?: ParsedPage[];
};

export type ImportedDocumentPayload = {
  title: string;
  description?: string;
  language?: string;
  mimeType?: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export type ChunkDraft = {
  chunkOrder: number;
  content: string;
  tokenCount: number;
  checksum: string;
  metadata?: Record<string, unknown>;
};

export type ListKnowledgeSourcesFilter = {
  companyId: string;
  sourceType?: KnowledgeSourceType;
  isEnabled?: boolean;
  limit?: number;
};

export type ListKnowledgeDocumentsFilter = {
  companyId: string;
  sourceId?: string;
  status?: DocumentStatus;
  limit?: number;
};

export type ListKnowledgeVersionsFilter = {
  companyId: string;
  documentId: string;
};

export type ListKnowledgeSectionsFilter = {
  companyId: string;
  documentId: string;
  versionId: string;
};

export type ListKnowledgeChunksFilter = {
  companyId: string;
  documentId: string;
  versionId?: string;
  limit?: number;
};

export type SoftDeleteInput = {
  id: string;
  deletedBy?: string | null;
};

export type ReorderSectionInput = {
  sectionId: string;
  sectionOrder: number;
};
