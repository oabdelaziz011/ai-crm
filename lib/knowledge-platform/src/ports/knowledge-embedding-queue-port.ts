import type { KnowledgeDocumentRecord, ServiceContext } from "../types.js";

export type BuildEmbeddingQueuePortResult = {
  document: KnowledgeDocumentRecord;
  jobsCreated: number;
  jobsSkipped: number;
  jobsDuplicate: number;
  invalidChunksSkipped: number;
  queuedJobCount: number;
  idempotent: boolean;
};

export interface KnowledgeEmbeddingQueuePort {
  buildQueueForPublishedDocument(
    ctx: ServiceContext,
    input: { documentId: string; versionId: string; companyId: string },
  ): Promise<BuildEmbeddingQueuePortResult>;
}
