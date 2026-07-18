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

/** Persistence-only repository. No business logic. */
export interface RetrievalPolicyRepository {
  findByCompany(companyId: string): Promise<RetrievalPolicyRecord[]>;
  create(input: CreateRetrievalPolicyInput): Promise<RetrievalPolicyRecord>;
  update(input: UpdateRetrievalPolicyInput): Promise<RetrievalPolicyRecord>;
  archive(policyId: string): Promise<RetrievalPolicyRecord>;
  findById(id: string): Promise<RetrievalPolicyRecord | null>;
  findDefault(companyId: string): Promise<RetrievalPolicyRecord | null>;
}

/** Persistence-only repository. No business logic. */
export interface RetrievalExecutionRepository {
  createExecution(input: CreateRetrievalExecutionInput): Promise<RetrievalExecutionRecord>;
  updateStatus(
    executionId: string,
    status: RetrievalExecutionRecord["execution_status"],
  ): Promise<RetrievalExecutionRecord>;
  completeExecution(
    executionId: string,
    input: { executionTimeMs: number; metadata?: Record<string, unknown> },
  ): Promise<RetrievalExecutionRecord>;
  failExecution(
    executionId: string,
    input: { executionTimeMs: number; errorMessage: string },
  ): Promise<RetrievalExecutionRecord>;
  findExecution(id: string): Promise<RetrievalExecutionRecord | null>;
  findByCompany(companyId: string): Promise<RetrievalExecutionRecord[]>;
}

/** Persistence-only repository. No business logic. */
export interface RetrievalContextRepository {
  createContext(input: CreateRetrievalContextInput): Promise<RetrievalContextRecord>;
  saveContextChunks(inputs: CreateRetrievalContextChunkInput[]): Promise<RetrievalContextChunkRecord[]>;
  findContext(id: string): Promise<RetrievalContextRecord | null>;
  listContextChunks(contextId: string): Promise<RetrievalContextChunkRecord[]>;
  findContextByExecution(executionId: string): Promise<RetrievalContextRecord | null>;
}

/** Persistence-only repository. No business logic. */
export interface RetrievalMetricsRepository {
  saveMetrics(input: CreateRetrievalMetricsInput): Promise<RetrievalMetricsRecord>;
  findByExecution(executionId: string): Promise<RetrievalMetricsRecord | null>;
}

/** Read-only cross-context port. No writes. */
export interface VectorQueryReadRepository {
  findExecution(executionId: string): Promise<VectorQueryExecutionSnapshot | null>;
  listResults(executionId: string): Promise<VectorQueryResultSnapshot[]>;
}

/** Read-only cross-context port. No writes. */
export interface KnowledgeHydrationReadRepository {
  resolveChunkFromIndexedVector(indexedVectorId: string): Promise<KnowledgeChunkSnapshot | null>;
  resolveDocument(documentId: string): Promise<KnowledgeDocumentSnapshot | null>;
  resolveSource(sourceId: string): Promise<KnowledgeSourceSnapshot | null>;
  listAdjacentChunks(
    documentId: string,
    chunkOrder: number,
    windowSize: number,
  ): Promise<KnowledgeChunkSnapshot[]>;
}
