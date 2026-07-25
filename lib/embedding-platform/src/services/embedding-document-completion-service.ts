import type { KnowledgeDocumentRepository } from "@workspace/knowledge-platform/repositories";
import {
  getPublishingMetadata,
  withPublishingMetadata,
} from "@workspace/knowledge-platform/repositories";
import type { EmbeddingJobRepository } from "../repositories/embedding-repositories.js";
import type { EmbeddingJobRecord, ServiceContext } from "../types.js";

export type DocumentJobSummary = {
  documentId: string;
  versionId: string;
  total: number;
  pending: number;
  completed: number;
  failed: number;
};

export type SyncDocumentProgressResult = {
  documentId: string;
  versionId: string;
  status: "processing" | "indexed" | "failed" | "unchanged";
  summary: DocumentJobSummary;
};

type DocumentVersionTarget = {
  documentId: string;
  versionId: string;
};

function extractDocumentTargets(jobs: EmbeddingJobRecord[]): DocumentVersionTarget[] {
  const targets = new Map<string, DocumentVersionTarget>();
  for (const job of jobs) {
    const documentId = typeof job.metadata.documentId === "string" ? job.metadata.documentId : null;
    const versionId = typeof job.metadata.versionId === "string" ? job.metadata.versionId : null;
    if (!documentId || !versionId) continue;
    targets.set(`${documentId}:${versionId}`, { documentId, versionId });
  }
  return [...targets.values()];
}

function summarizeJobs(jobs: EmbeddingJobRecord[]): Omit<DocumentJobSummary, "documentId" | "versionId"> {
  let pending = 0;
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "running") pending += 1;
    else if (job.status === "completed") completed += 1;
    else if (job.status === "failed") failed += 1;
  }
  return { total: jobs.length, pending, completed, failed };
}

export class EmbeddingDocumentCompletionService {
  constructor(
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly jobRepository: EmbeddingJobRepository,
  ) {}

  async syncDocuments(
    ctx: ServiceContext,
    companyId: string,
    affectedJobs: EmbeddingJobRecord[],
  ): Promise<SyncDocumentProgressResult[]> {
    const targets = extractDocumentTargets(affectedJobs);
    const results: SyncDocumentProgressResult[] = [];

    for (const target of targets) {
      results.push(await this.syncDocument(ctx, companyId, target.documentId, target.versionId));
    }

    return results;
  }

  async syncDocument(
    ctx: ServiceContext,
    companyId: string,
    documentId: string,
    versionId: string,
  ): Promise<SyncDocumentProgressResult> {
    const jobs = await this.jobRepository.listByDocumentVersion({
      companyId,
      documentId,
      versionId,
    });
    const summary: DocumentJobSummary = {
      documentId,
      versionId,
      ...summarizeJobs(jobs),
    };

    const document = await this.documentRepository.findById(documentId);
    if (!document || document.company_id !== companyId) {
      return { documentId, versionId, status: "unchanged", summary };
    }
    if (document.status !== "indexing" && document.status !== "indexed") {
      return { documentId, versionId, status: "unchanged", summary };
    }

    const publishing = getPublishingMetadata(document.metadata);
    const workerStartedAt =
      publishing.indexing?.worker_started_at ??
      publishing.queue?.started_at ??
      document.updated_at;
    const providerJob = jobs.find((job) => job.provider) ?? jobs[0];
    const now = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - new Date(workerStartedAt).getTime());

    const baseIndexing = {
      worker_started_at: workerStartedAt,
      total_chunk_count: summary.total,
      indexed_chunk_count: summary.completed,
      failed_chunk_count: summary.failed,
      last_embedding_provider: providerJob?.provider ?? publishing.indexing?.last_embedding_provider ?? null,
      embedding_model: providerJob?.model ?? publishing.indexing?.embedding_model ?? null,
      vector_indexed_count: summary.completed,
    };

    if (summary.pending > 0) {
      await this.documentRepository.update({
        documentId,
        status: "indexing",
        metadata: withPublishingMetadata(document.metadata, {
          embedding_status: "processing",
          indexing: baseIndexing,
        }),
      });
      return { documentId, versionId, status: "processing", summary };
    }

    if (summary.failed > 0) {
      await this.documentRepository.update({
        documentId,
        status: "indexing",
        metadata: withPublishingMetadata(document.metadata, {
          embedding_status: "failed",
          indexing: {
            ...baseIndexing,
            indexing_duration_ms: durationMs,
          },
        }),
      });
      return { documentId, versionId, status: "failed", summary };
    }

    if (summary.total > 0 && summary.completed === summary.total) {
      await this.documentRepository.update({
        documentId,
        status: "indexed",
        metadata: withPublishingMetadata(document.metadata, {
          embedding_status: "completed",
          indexing: {
            ...baseIndexing,
            completed_at: now,
            indexing_duration_ms: durationMs,
          },
        }),
      });
      return { documentId, versionId, status: "indexed", summary };
    }

    return { documentId, versionId, status: "unchanged", summary };
  }
}
