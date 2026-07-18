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

export type VectorStoreDefinitionSnapshot = {
  key: string;
  default_configuration: Record<string, unknown>;
  configuration_schema: Record<string, unknown>;
  is_active: boolean;
};

export interface VectorStoreDefinitionReader {
  findByKey(key: string): Promise<VectorStoreDefinitionSnapshot | null>;
}

/** Persistence-only repository. No business logic. */
export interface SearchPolicyRepository {
  findByCompany(companyId: string): Promise<VectorSearchPolicyRecord[]>;
  create(input: CreateSearchPolicyInput): Promise<VectorSearchPolicyRecord>;
  update(input: UpdateSearchPolicyInput): Promise<VectorSearchPolicyRecord>;
  archive(policyId: string): Promise<VectorSearchPolicyRecord>;
  findById(id: string): Promise<VectorSearchPolicyRecord | null>;
  findDefault(companyId: string): Promise<VectorSearchPolicyRecord | null>;
}

/** Persistence-only repository. No business logic. */
export interface QueryExecutionRepository {
  createExecution(input: CreateQueryExecutionInput): Promise<VectorQueryExecutionRecord>;
  updateStatus(
    executionId: string,
    status: VectorQueryExecutionRecord["execution_status"],
  ): Promise<VectorQueryExecutionRecord>;
  completeExecution(
    executionId: string,
    input: { executionTimeMs: number; resultCount: number; metadata?: Record<string, unknown> },
  ): Promise<VectorQueryExecutionRecord>;
  failExecution(
    executionId: string,
    input: { executionTimeMs: number; errorMessage: string },
  ): Promise<VectorQueryExecutionRecord>;
  findExecution(id: string): Promise<VectorQueryExecutionRecord | null>;
  findByCompany(companyId: string): Promise<VectorQueryExecutionRecord[]>;
}

/** Persistence-only repository. No business logic. */
export interface QueryResultRepository {
  saveResults(inputs: CreateQueryResultInput[]): Promise<VectorQueryResultRecord[]>;
  removeResults(executionId: string): Promise<void>;
  listExecutionResults(executionId: string): Promise<VectorQueryResultRecord[]>;
}

/** Read-only cross-context port. No writes. */
export interface IndexedVectorReadRepository {
  resolveIndexedVector(
    collectionId: string,
    knowledgeEmbeddingId: string,
  ): Promise<IndexedVectorSnapshot | null>;
  resolveCollection(collectionId: string): Promise<VectorCollectionSnapshot | null>;
  resolveEmbedding(embeddingId: string): Promise<KnowledgeEmbeddingSnapshot | null>;
}

export interface VectorStoreConnectionReader {
  findById(connectionId: string): Promise<VectorStoreConnectionSnapshot | null>;
}

/** @deprecated Use IndexedVectorReadRepository.resolveCollection */
export type VectorCollectionReader = Pick<IndexedVectorReadRepository, "resolveCollection">;

/** @deprecated Use IndexedVectorReadRepository.resolveEmbedding */
export type KnowledgeEmbeddingReader = Pick<IndexedVectorReadRepository, "resolveEmbedding">;

/** @deprecated Use IndexedVectorReadRepository.resolveIndexedVector */
export type IndexedVectorReader = Pick<IndexedVectorReadRepository, "resolveIndexedVector">;
