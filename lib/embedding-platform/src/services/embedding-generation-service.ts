import {
  DEFAULT_BATCH_PROCESS_LIMIT,
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_MAX_RETRIES,
  EMBEDDING_PERMISSIONS,
} from "../constants.js";
import {
  EmbeddingJobNotFoundError,
  EmbeddingJobStateError,
  EmbeddingProviderConnectionNotFoundError,
  KnowledgeChunkNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { EmbeddingProviderFactory } from "../factory/embedding-provider-factory.js";
import type { EmbeddingTelemetryPort } from "../ports/embedding-telemetry-port.js";
import { NoopEmbeddingTelemetryPort } from "../ports/embedding-telemetry-port.js";
import type {
  EmbeddingJobRepository,
  EmbeddingProviderConnectionRepository,
  KnowledgeChunkReader,
  KnowledgeEmbeddingRepository,
} from "../repositories/embedding-repositories.js";
import type {
  EmbeddingJobRecord,
  EnqueueEmbeddingInput,
  EnqueueEmbeddingsForVersionInput,
  ProcessEmbeddingBatchOptions,
  ServiceContext,
} from "../types.js";
import { computeEmbeddingChecksum } from "../utils/embedding-utils.js";
import type { EmbeddingVersionService } from "./embedding-version-service.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(EMBEDDING_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export class EmbeddingGenerationService {
  constructor(
    private readonly factory: EmbeddingProviderFactory,
    private readonly connectionRepository: EmbeddingProviderConnectionRepository,
    private readonly embeddingRepository: KnowledgeEmbeddingRepository,
    private readonly chunkReader: KnowledgeChunkReader,
    private readonly versionService: EmbeddingVersionService,
    private readonly telemetry: EmbeddingTelemetryPort = new NoopEmbeddingTelemetryPort(),
  ) {}

  async generateForJob(ctx: ServiceContext, job: EmbeddingJobRecord) {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);

    const chunk = await this.chunkReader.findById(job.knowledge_chunk_id);
    if (!chunk) throw new KnowledgeChunkNotFoundError(job.knowledge_chunk_id);
    assertCompanyAccess(ctx, chunk.company_id);

    if (chunk.company_id !== job.company_id) {
      throw new ValidationError("Knowledge chunk does not belong to the job company.");
    }

    const connection = await this.connectionRepository.findById(job.connection_id);
    if (!connection || !connection.is_enabled) {
      throw new EmbeddingProviderConnectionNotFoundError(job.connection_id);
    }

    const providerKey = connection.embedding_provider_definition?.key ?? job.provider;
    const provider = await this.factory.resolve({
      providerKey,
      configuration: connection.configuration,
    });

    const started = Date.now();
    try {
      const result = await provider.generateEmbedding({
        text: chunk.content,
        model: job.model,
        metadata: job.metadata,
      });

      await this.telemetry.recordExecution({
        companyId: job.company_id,
        providerKey: result.providerKey,
        model: result.model,
        operation: "generate",
        status: "succeeded",
        latencyMs: result.latencyMs ?? Date.now() - started,
        mock: result.mock,
      });

      const checksum = computeEmbeddingChecksum({
        chunkChecksum: chunk.checksum,
        provider: result.providerKey,
        model: result.model,
        vector: result.vector,
      });

      const embedding = await this.embeddingRepository.create({
        companyId: job.company_id,
        knowledgeChunkId: job.knowledge_chunk_id,
        connectionId: job.connection_id,
        provider: result.providerKey,
        model: result.model,
        dimensions: result.dimensions,
        embeddingVersion: job.embedding_version,
        vector: result.vector,
        checksum,
        status: "pending",
        metadata: {
          chunkChecksum: chunk.checksum,
          mock: result.mock ?? false,
          latencyMs: result.latencyMs,
          tokenCount: result.tokenCount,
        },
        createdBy: ctx.userId,
      });

      return this.versionService.activateEmbedding(ctx, embedding.id);
    } catch (error) {
      await this.telemetry.recordExecution({
        companyId: job.company_id,
        providerKey,
        model: job.model,
        operation: "generate",
        status: "failed",
        latencyMs: Date.now() - started,
        errorMessage: error instanceof Error ? error.message : "Embedding generation failed.",
      });
      throw error;
    }
  }

  async generateForJobsBatch(ctx: ServiceContext, jobs: EmbeddingJobRecord[]) {
    if (jobs.length === 0) return [];

    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);
    const firstJob = jobs[0]!;
    assertCompanyAccess(ctx, firstJob.company_id);

    const connection = await this.connectionRepository.findById(firstJob.connection_id);
    if (!connection || !connection.is_enabled) {
      throw new EmbeddingProviderConnectionNotFoundError(firstJob.connection_id);
    }

    const providerKey = connection.embedding_provider_definition?.key ?? firstJob.provider;
    const provider = await this.factory.resolve({
      providerKey,
      configuration: connection.configuration,
    });

    const chunks = await Promise.all(jobs.map((job) => this.chunkReader.findById(job.knowledge_chunk_id)));
    const items = jobs.map((job, index) => {
      const chunk = chunks[index];
      if (!chunk) throw new KnowledgeChunkNotFoundError(job.knowledge_chunk_id);
      if (chunk.company_id !== job.company_id) {
        throw new ValidationError("Knowledge chunk does not belong to the job company.");
      }
      return { job, chunk, text: chunk.content, model: job.model, metadata: job.metadata };
    });

    const started = Date.now();
    try {
      const batchResult = provider.generateEmbeddingsBatch
        ? await provider.generateEmbeddingsBatch({
            items: items.map((item) => ({ text: item.text, model: item.model, metadata: item.metadata })),
          })
        : {
            results: await Promise.all(
              items.map((item) =>
                provider.generateEmbedding({ text: item.text, model: item.model, metadata: item.metadata }),
              ),
            ),
            providerKey,
            latencyMs: Date.now() - started,
          };

      await this.telemetry.recordExecution({
        companyId: firstJob.company_id,
        providerKey: batchResult.providerKey,
        model: firstJob.model,
        operation: "generate_batch",
        status: "succeeded",
        latencyMs: batchResult.latencyMs ?? Date.now() - started,
        batchSize: jobs.length,
        mock: batchResult.mock,
      });

      const embeddings = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        const result = batchResult.results[index];
        if (!result) {
          throw new ValidationError(`Batch embedding result missing for job ${item.job.id}.`);
        }

        const checksum = computeEmbeddingChecksum({
          chunkChecksum: item.chunk.checksum,
          provider: result.providerKey,
          model: result.model,
          vector: result.vector,
        });

        const embedding = await this.embeddingRepository.create({
          companyId: item.job.company_id,
          knowledgeChunkId: item.job.knowledge_chunk_id,
          connectionId: item.job.connection_id,
          provider: result.providerKey,
          model: result.model,
          dimensions: result.dimensions,
          embeddingVersion: item.job.embedding_version,
          vector: result.vector,
          checksum,
          status: "pending",
          metadata: {
            chunkChecksum: item.chunk.checksum,
            mock: result.mock ?? false,
            latencyMs: result.latencyMs,
            tokenCount: result.tokenCount,
          },
          createdBy: ctx.userId,
        });

        embeddings.push(await this.versionService.activateEmbedding(ctx, embedding.id));
      }

      return embeddings;
    } catch (error) {
      await this.telemetry.recordExecution({
        companyId: firstJob.company_id,
        providerKey,
        model: firstJob.model,
        operation: "generate_batch",
        status: "failed",
        latencyMs: Date.now() - started,
        batchSize: jobs.length,
        errorMessage: error instanceof Error ? error.message : "Batch embedding generation failed.",
      });
      throw error;
    }
  }
}

export class EmbeddingJobService {
  constructor(
    private readonly jobRepository: EmbeddingJobRepository,
    private readonly connectionRepository: EmbeddingProviderConnectionRepository,
    private readonly chunkReader: KnowledgeChunkReader,
    private readonly generationService: EmbeddingGenerationService,
    private readonly versionService: EmbeddingVersionService,
  ) {}

  async enqueue(ctx: ServiceContext, input: EnqueueEmbeddingInput): Promise<EmbeddingJobRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);
    assertCompanyAccess(ctx, input.companyId);

    const chunk = await this.chunkReader.findById(input.knowledgeChunkId);
    if (!chunk) throw new KnowledgeChunkNotFoundError(input.knowledgeChunkId);
    if (chunk.company_id !== input.companyId) {
      throw new ValidationError("Knowledge chunk does not belong to the requested company.");
    }

    const connection = await this.connectionRepository.findById(input.connectionId);
    if (!connection || !connection.is_enabled) {
      throw new EmbeddingProviderConnectionNotFoundError(input.connectionId);
    }
    if (connection.company_id !== input.companyId) {
      throw new ValidationError("Embedding connection does not belong to the requested company.");
    }

    const providerKey = connection.embedding_provider_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Embedding connection provider definition is missing.");
    }

    const model =
      input.model ??
      (typeof connection.configuration.model === "string" ? connection.configuration.model : null) ??
      connection.embedding_provider_definition?.default_model;
    if (!model) {
      throw new ValidationError("Embedding model is required.");
    }

    const embeddingVersion = await this.versionService.resolveNextVersion(
      input.knowledgeChunkId,
      providerKey,
      model,
      Boolean(input.regenerate),
    );

    return this.jobRepository.create({
      companyId: input.companyId,
      knowledgeChunkId: input.knowledgeChunkId,
      connectionId: input.connectionId,
      provider: providerKey,
      model,
      embeddingVersion,
      maxRetries: DEFAULT_MAX_RETRIES,
      metadata: {
        regenerate: Boolean(input.regenerate),
        chunkChecksum: chunk.checksum,
      },
      createdBy: ctx.userId,
    });
  }

  async enqueueForVersion(ctx: ServiceContext, input: EnqueueEmbeddingsForVersionInput) {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);
    assertCompanyAccess(ctx, input.companyId);

    const chunks = await this.chunkReader.listByVersion(input.companyId, input.versionId);
    if (chunks.length === 0) {
      throw new ValidationError("No knowledge chunks found for the requested version.");
    }

    const jobs: EmbeddingJobRecord[] = [];
    for (const chunk of chunks) {
      jobs.push(
        await this.enqueue(ctx, {
          companyId: input.companyId,
          knowledgeChunkId: chunk.id,
          connectionId: input.connectionId,
          model: input.model,
          regenerate: input.regenerate,
        }),
      );
    }
    return jobs;
  }

  async cancel(ctx: ServiceContext, jobId: string): Promise<EmbeddingJobRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);

    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new EmbeddingJobNotFoundError(jobId);
    assertCompanyAccess(ctx, job.company_id);

    if (job.status !== "queued" && job.status !== "running") {
      throw new EmbeddingJobStateError(`Job ${jobId} cannot be cancelled from status ${job.status}.`);
    }

    return this.jobRepository.update({
      jobId,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    });
  }

  async retry(ctx: ServiceContext, jobId: string): Promise<EmbeddingJobRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);

    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new EmbeddingJobNotFoundError(jobId);
    assertCompanyAccess(ctx, job.company_id);

    if (job.status !== "failed") {
      throw new EmbeddingJobStateError(`Job ${jobId} can only be retried from failed status.`);
    }
    if (job.retry_count >= job.max_retries) {
      throw new EmbeddingJobStateError(`Job ${jobId} has exceeded max retries.`);
    }

    return this.jobRepository.update({
      jobId,
      status: "queued",
      retryCount: job.retry_count + 1,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      lockedBy: null,
      lockedAt: null,
    });
  }

  private async finalizeJobFailure(job: EmbeddingJobRecord, message: string) {
    if (job.retry_count < job.max_retries) {
      return this.jobRepository.update({
        jobId: job.id,
        status: "queued",
        retryCount: job.retry_count + 1,
        errorMessage: message,
        startedAt: null,
        completedAt: null,
        lockedBy: null,
        lockedAt: null,
      });
    }

    return this.jobRepository.update({
      jobId: job.id,
      status: "failed",
      errorMessage: message,
      completedAt: new Date().toISOString(),
      lockedBy: null,
      lockedAt: null,
    });
  }

  async processNext(ctx: ServiceContext, companyId: string) {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);
    assertCompanyAccess(ctx, companyId);

    const job = await this.jobRepository.claimNextQueued(companyId);
    if (!job) return null;

    try {
      const embedding = await this.generationService.generateForJob(ctx, job);
      return this.jobRepository.update({
        jobId: job.id,
        status: "completed",
        resultEmbeddingId: embedding.id,
        completedAt: new Date().toISOString(),
        errorMessage: null,
        lockedBy: null,
        lockedAt: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding generation failed.";
      return this.finalizeJobFailure(job, message);
    }
  }

  async processBatch(ctx: ServiceContext, companyId: string, options?: ProcessEmbeddingBatchOptions) {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.generate);
    assertCompanyAccess(ctx, companyId);

    const limit = options?.limit ?? DEFAULT_BATCH_PROCESS_LIMIT;
    const batchSize = options?.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
    const claimed = await this.jobRepository.claimNextQueuedBatch(companyId, limit, options?.workerId);
    if (claimed.length === 0) return [];

    const completed: EmbeddingJobRecord[] = [];
    for (const group of chunkArray(claimed, batchSize)) {
      try {
        const embeddings = await this.generationService.generateForJobsBatch(ctx, group);
        for (let index = 0; index < group.length; index += 1) {
          const job = group[index]!;
          const embedding = embeddings[index];
          completed.push(
            await this.jobRepository.update({
              jobId: job.id,
              status: "completed",
              resultEmbeddingId: embedding?.id ?? null,
              completedAt: new Date().toISOString(),
              errorMessage: null,
              lockedBy: null,
              lockedAt: null,
            }),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Batch embedding generation failed.";
        for (const job of group) {
          completed.push(await this.finalizeJobFailure(job, message));
        }
      }
    }

    return completed;
  }

  async listJobs(ctx: ServiceContext, companyId: string, knowledgeChunkId?: string) {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.jobRepository.list({ companyId, knowledgeChunkId });
  }
}
