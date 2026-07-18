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

export interface VectorStoreDefinitionRepository {
  listActive(): Promise<VectorStoreDefinitionRecord[]>;
  listAll(): Promise<VectorStoreDefinitionRecord[]>;
  findById(id: string): Promise<VectorStoreDefinitionRecord | null>;
  findByKey(key: string): Promise<VectorStoreDefinitionRecord | null>;
}

export interface VectorStoreConnectionRepository {
  create(input: CreateVectorStoreConnectionInput): Promise<VectorStoreConnectionRecord>;
  findById(id: string): Promise<VectorStoreConnectionRecord | null>;
  list(filter: ListVectorStoreConnectionsFilter): Promise<VectorStoreConnectionRecord[]>;
  update(input: UpdateVectorStoreConnectionInput): Promise<VectorStoreConnectionRecord>;
  softDelete(connectionId: string, deletedBy?: string | null): Promise<VectorStoreConnectionRecord>;
}

export interface VectorCollectionRepository {
  create(input: CreateVectorCollectionInput): Promise<VectorCollectionRecord>;
  findById(id: string): Promise<VectorCollectionRecord | null>;
  list(filter: ListVectorCollectionsFilter): Promise<VectorCollectionRecord[]>;
  update(input: UpdateVectorCollectionInput): Promise<VectorCollectionRecord>;
  softDelete(collectionId: string, deletedBy?: string | null): Promise<VectorCollectionRecord>;
  deactivateActive(companyId: string, name: string): Promise<void>;
}

export interface IndexedVectorRepository {
  create(input: CreateIndexedVectorInput): Promise<IndexedVectorRecord>;
  findById(id: string): Promise<IndexedVectorRecord | null>;
  list(filter: ListIndexedVectorsFilter): Promise<IndexedVectorRecord[]>;
  update(input: UpdateIndexedVectorInput): Promise<IndexedVectorRecord>;
  findByEmbeddingAndCollection(
    knowledgeEmbeddingId: string,
    collectionId: string,
  ): Promise<IndexedVectorRecord | null>;
}

export interface KnowledgeEmbeddingReader {
  findById(embeddingId: string): Promise<KnowledgeEmbeddingSnapshot | null>;
}
