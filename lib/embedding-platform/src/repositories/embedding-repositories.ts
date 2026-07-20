import type {
  CreateEmbeddingJobInput,
  CreateEmbeddingProviderConnectionInput,
  CreateKnowledgeEmbeddingInput,
  EmbeddingJobRecord,
  EmbeddingProviderConnectionRecord,
  EmbeddingProviderDefinitionRecord,
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
import type { KnowledgeChunkSnapshot } from "../types.js";

export interface EmbeddingProviderDefinitionRepository {
  listActive(): Promise<EmbeddingProviderDefinitionRecord[]>;
  listAll(): Promise<EmbeddingProviderDefinitionRecord[]>;
  findById(id: string): Promise<EmbeddingProviderDefinitionRecord | null>;
  findByKey(key: string): Promise<EmbeddingProviderDefinitionRecord | null>;
}

export interface EmbeddingProviderConnectionRepository {
  create(input: CreateEmbeddingProviderConnectionInput): Promise<EmbeddingProviderConnectionRecord>;
  findById(id: string): Promise<EmbeddingProviderConnectionRecord | null>;
  list(filter: ListEmbeddingProviderConnectionsFilter): Promise<EmbeddingProviderConnectionRecord[]>;
  update(input: UpdateEmbeddingProviderConnectionInput): Promise<EmbeddingProviderConnectionRecord>;
  softDelete(connectionId: string, deletedBy?: string | null): Promise<EmbeddingProviderConnectionRecord>;
}

export interface KnowledgeEmbeddingRepository {
  create(input: CreateKnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingRecord>;
  findById(id: string): Promise<KnowledgeEmbeddingRecord | null>;
  list(filter: ListKnowledgeEmbeddingsFilter): Promise<KnowledgeEmbeddingRecord[]>;
  update(input: UpdateKnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingRecord>;
  findActive(
    knowledgeChunkId: string,
    provider: string,
    model: string,
  ): Promise<KnowledgeEmbeddingRecord | null>;
  getLatestVersion(knowledgeChunkId: string, provider: string, model: string): Promise<number>;
  deactivateActive(knowledgeChunkId: string, provider: string, model: string): Promise<void>;
}

export interface EmbeddingJobRepository {
  create(input: CreateEmbeddingJobInput): Promise<EmbeddingJobRecord>;
  createMany(inputs: CreateEmbeddingJobInput[]): Promise<EmbeddingJobRecord[]>;
  findById(id: string): Promise<EmbeddingJobRecord | null>;
  list(filter: ListEmbeddingJobsFilter): Promise<EmbeddingJobRecord[]>;
  listByChunkIds(filter: ListEmbeddingJobsByChunkIdsFilter): Promise<EmbeddingJobRecord[]>;
  listByDocumentVersion(filter: ListEmbeddingJobsByDocumentFilter): Promise<EmbeddingJobRecord[]>;
  update(input: UpdateEmbeddingJobInput): Promise<EmbeddingJobRecord>;
  claimNextQueued(companyId: string, workerId?: string | null): Promise<EmbeddingJobRecord | null>;
  claimNextQueuedBatch(companyId: string, limit: number, workerId?: string | null): Promise<EmbeddingJobRecord[]>;
  recoverStaleLocks(staleSeconds?: number): Promise<number>;
}

export interface KnowledgeChunkReader {
  findById(chunkId: string): Promise<KnowledgeChunkSnapshot | null>;
  listByVersion(companyId: string, versionId: string): Promise<KnowledgeChunkSnapshot[]>;
}
