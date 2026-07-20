import type { SupabaseClient } from "@supabase/supabase-js";
import type { VectorStoreServices } from "@workspace/vector-store";
import type { EmbeddingTelemetryPort } from "../ports/embedding-telemetry-port.js";
import type { EmbeddingJobRepository } from "../repositories/embedding-repositories.js";
import type {
  EmbeddingJobRecord,
  ProcessEmbeddingBatchOptions,
  ServiceContext,
} from "../types.js";
import type { EmbeddingDocumentCompletionService, SyncDocumentProgressResult } from "./embedding-document-completion-service.js";
import type { EmbeddingIndexingService, IndexCompletedJobsResult } from "./embedding-indexing-service.js";
import type { EmbeddingJobService } from "./embedding-generation-service.js";

export type ProcessCompanyQueueOptions = ProcessEmbeddingBatchOptions & {
  recoverStaleLocks?: boolean;
  staleLockSeconds?: number;
  drain?: boolean;
};

export type ProcessCompanyQueueResult = {
  jobs: EmbeddingJobRecord[];
  batches: number;
  indexing: IndexCompletedJobsResult;
  documents: SyncDocumentProgressResult[];
  recoveredLocks: number;
  queueLatencyMs: number;
  processingDurationMs: number;
};

export class EmbeddingWorkerService {
  constructor(
    private readonly client: SupabaseClient,
    private readonly jobs: EmbeddingJobService,
    private readonly jobRepository: EmbeddingJobRepository,
    private readonly indexing: EmbeddingIndexingService,
    private readonly completion: EmbeddingDocumentCompletionService,
    private readonly telemetry: EmbeddingTelemetryPort,
  ) {}

  async recoverStaleLocks(staleSeconds = 900): Promise<number> {
    return this.jobRepository.recoverStaleLocks(staleSeconds);
  }

  async processCompanyQueue(
    ctx: ServiceContext,
    companyId: string,
    options?: ProcessCompanyQueueOptions,
  ): Promise<ProcessCompanyQueueResult> {
    const started = Date.now();
    let recoveredLocks = 0;
    if (options?.recoverStaleLocks !== false) {
      recoveredLocks = await this.recoverStaleLocks(options?.staleLockSeconds ?? 900);
    }

    const allJobs: EmbeddingJobRecord[] = [];
    const allDocuments: SyncDocumentProgressResult[] = [];
    let batches = 0;
    let indexingTotals: IndexCompletedJobsResult = {
      indexed: 0,
      skipped: 0,
      failed: 0,
      vectorLatencyMs: 0,
    };

    do {
      const batchStarted = Date.now();
      const jobs = await this.jobs.processBatch(ctx, companyId, options);
      if (jobs.length === 0) break;

      batches += 1;
      const queueLatencyMs = jobs.reduce((total, job) => {
        const queuedAt = new Date(job.queued_at).getTime();
        const startedAt = job.started_at ? new Date(job.started_at).getTime() : batchStarted;
        return total + Math.max(0, startedAt - queuedAt);
      }, 0);

      await this.telemetry.recordExecution({
        companyId,
        providerKey: jobs[0]?.provider ?? "unknown",
        model: jobs[0]?.model ?? "unknown",
        operation: "generate_batch",
        status: "succeeded",
        latencyMs: Date.now() - batchStarted,
        batchSize: jobs.length,
      });

      const indexing = await this.indexing.indexCompletedJobs(ctx, companyId, jobs);
      indexingTotals = {
        indexed: indexingTotals.indexed + indexing.indexed,
        skipped: indexingTotals.skipped + indexing.skipped,
        failed: indexingTotals.failed + indexing.failed,
        vectorLatencyMs: indexingTotals.vectorLatencyMs + indexing.vectorLatencyMs,
      };

      const documents = await this.completion.syncDocuments(ctx, companyId, jobs);
      allJobs.push(...jobs);
      allDocuments.push(...documents);

      if (!options?.drain) break;
    } while (true);

    return {
      jobs: allJobs,
      batches,
      indexing: indexingTotals,
      documents: allDocuments,
      recoveredLocks,
      queueLatencyMs: allJobs.length > 0 ? Math.round(started / allJobs.length) : 0,
      processingDurationMs: Date.now() - started,
    };
  }
}

export function createEmbeddingWorkerService(deps: {
  client: SupabaseClient;
  jobs: EmbeddingJobService;
  jobRepository: EmbeddingJobRepository;
  indexing: EmbeddingIndexingService;
  completion: EmbeddingDocumentCompletionService;
  telemetry?: EmbeddingTelemetryPort;
}): EmbeddingWorkerService {
  return new EmbeddingWorkerService(
    deps.client,
    deps.jobs,
    deps.jobRepository,
    deps.indexing,
    deps.completion,
    deps.telemetry ?? { recordExecution: async () => {} },
  );
}
