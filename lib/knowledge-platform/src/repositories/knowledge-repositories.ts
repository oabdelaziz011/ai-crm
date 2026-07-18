import type {
  CreateKnowledgeChunkInput,
  CreateKnowledgeDocumentInput,
  CreateKnowledgeSectionInput,
  CreateKnowledgeSourceInput,
  CreateKnowledgeVersionInput,
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

export interface KnowledgeSourceRepository {
  create(input: CreateKnowledgeSourceInput): Promise<KnowledgeSourceRecord>;
  update(input: UpdateKnowledgeSourceInput): Promise<KnowledgeSourceRecord>;
  softDelete(input: SoftDeleteInput): Promise<KnowledgeSourceRecord>;
  findById(id: string): Promise<KnowledgeSourceRecord | null>;
  findByKey(companyId: string, key: string): Promise<KnowledgeSourceRecord | null>;
  list(filter: ListKnowledgeSourcesFilter): Promise<KnowledgeSourceRecord[]>;
}

export interface KnowledgeDocumentRepository {
  create(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocumentRecord>;
  update(input: UpdateKnowledgeDocumentInput): Promise<KnowledgeDocumentRecord>;
  softDelete(input: SoftDeleteInput): Promise<KnowledgeDocumentRecord>;
  findById(id: string): Promise<KnowledgeDocumentRecord | null>;
  list(filter: ListKnowledgeDocumentsFilter): Promise<KnowledgeDocumentRecord[]>;
}

export interface KnowledgeVersionRepository {
  create(input: CreateKnowledgeVersionInput): Promise<KnowledgeDocumentVersionRecord>;
  publish(versionId: string, publishedBy?: string | null): Promise<KnowledgeDocumentVersionRecord>;
  archive(versionId: string): Promise<KnowledgeDocumentVersionRecord>;
  findById(id: string): Promise<KnowledgeDocumentVersionRecord | null>;
  findByDocumentAndNumber(documentId: string, versionNumber: number): Promise<KnowledgeDocumentVersionRecord | null>;
  list(filter: ListKnowledgeVersionsFilter): Promise<KnowledgeDocumentVersionRecord[]>;
}

export interface KnowledgeSectionRepository {
  create(input: CreateKnowledgeSectionInput): Promise<KnowledgeSectionRecord>;
  update(input: UpdateKnowledgeSectionInput): Promise<KnowledgeSectionRecord>;
  reorder(input: ReorderSectionInput): Promise<KnowledgeSectionRecord>;
  softDelete(input: SoftDeleteInput): Promise<KnowledgeSectionRecord>;
  findById(id: string): Promise<KnowledgeSectionRecord | null>;
  list(filter: ListKnowledgeSectionsFilter): Promise<KnowledgeSectionRecord[]>;
}

export interface KnowledgeTagRepository {
  setTags(companyId: string, documentId: string, tags: string[]): Promise<KnowledgeTagRecord[]>;
  listByDocument(documentId: string): Promise<KnowledgeTagRecord[]>;
}

export interface KnowledgeChunkRepository {
  createMany(inputs: CreateKnowledgeChunkInput[]): Promise<KnowledgeChunkRecord[]>;
  softDeleteByVersion(versionId: string, deletedBy?: string | null): Promise<number>;
  list(filter: ListKnowledgeChunksFilter): Promise<KnowledgeChunkRecord[]>;
}
