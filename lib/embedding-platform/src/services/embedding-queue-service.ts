import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeDocumentRepository,
  KnowledgeEmbeddingQueuePort,
  BuildEmbeddingQueuePortResult,
} from "@workspace/knowledge-platform/repositories";
import {
  getPublishingMetadata,
  isRetrievalAvailable,
  withPublishingMetadata,
} from "@workspace/knowledge-platform/repositories";
import { DEFAULT_MAX_RETRIES, EMBEDDING_PERMISSIONS } from "../constants.js";
import {
  EmbeddingProviderConnectionNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type {
  EmbeddingJobRepository,
  EmbeddingProviderConnectionRepository,
  KnowledgeChunkReader,
  KnowledgeEmbeddingRepository,
} from "../repositories/embedding-repositories.js";
import type {
  CreateEmbeddingJobInput,
  EmbeddingJobRecord,
  EmbeddingProviderConnectionRecord,
  KnowledgeChunkSnapshot,
  ServiceContext,
} from "../types.js";
import type { EmbeddingVersionService } from "./embedding-version-service.js";

const KNOWLEDGE_PUBLISH_PERMISSION = "knowledge.publish";
const ACTIVE_COMPANY_STATUSES = new Set(["Active", "Trial"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set(["canceled", "expired"]);
const QUEUE_JOB_STATUSES = ["queued", "running", "completed"] as const;
const QUEUE_INSERT_BATCH_SIZE = 100;

function assertQueuePermission(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.hasPermission(KNOWLEDGE_PUBLISH_PERMISSION)) return;
  if (ctx.hasPermission(EMBEDDING_PERMISSIONS.generate)) return;
  throw new PermissionDeniedError(EMBEDDING_PERMISSIONS.generate);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(EMBEDDING_PERMISSIONS.view);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function isChunkEligible(chunk: KnowledgeChunkSnapshot, companyId: string): boolean {
  if (chunk.company_id !== companyId) return false;
  if (!chunk.content?.trim()) return false;
  if (!chunk.checksum?.trim()) return false;
  return true;
}

export type BuildEmbeddingQueueInput = {
  documentId: string;
  versionId: string;
  companyId: string;
  connectionId?: string;
};

export type BuildEmbeddingQueueResult = BuildEmbeddingQueuePortResult;

export class EmbeddingQueueService implements KnowledgeEmbeddingQueuePort {
  constructor(
    private readonly client: SupabaseClient,
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly jobRepository: EmbeddingJobRepository,
    private readonly connectionRepository: EmbeddingProviderConnectionRepository,
    private readonly chunkReader: KnowledgeChunkReader,
    private readonly versionService: EmbeddingVersionService,
  ) {}

  async buildQueueForPublishedDocument(
    ctx: ServiceContext,
    input: BuildEmbeddingQueueInput,
  ): Promise<BuildEmbeddingQueueResult> {
    assertQueuePermission(ctx);
    assertCompanyAccess(ctx, input.companyId);

    await this.assertActiveTenant(input.companyId);

    const document = await this.documentRepository.findById(input.documentId);
    if (!document) {
      throw new ValidationError(`Knowledge document ${input.documentId} was not found.`);
    }
    if (document.company_id !== input.companyId) {
      throw new PermissionDeniedError(EMBEDDING_PERMISSIONS.view);
    }
    if (document.deleted_at) {
      throw new ValidationError("Deleted documents cannot enter the embedding queue.");
    }
    if (document.status === "draft" || document.status === "archived") {
      throw new ValidationError(`Document status ${document.status} is not eligible for embedding queue creation.`);
    }
    if (!isRetrievalAvailable(document.metadata, document.status)) {
      throw new ValidationError("Document is not retrieval-enabled and cannot be queued for embedding.");
    }
    if (document.published_version_id !== input.versionId) {
      throw new ValidationError("Embedding queue can only be built for the current published version.");
    }

    const startedAt = new Date().toISOString();
    const connection = await this.resolveConnection(ctx, input.companyId, input.connectionId);
    if (!connection) {
      throw new EmbeddingProviderConnectionNotFoundError(input.connectionId ?? "default");
    }

    const providerKey = connection.embedding_provider_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Embedding connection provider definition is missing.");
    }

    const model =
      (typeof connection.configuration.model === "string" ? connection.configuration.model : null) ??
      connection.embedding_provider_definition?.default_model;
    if (!model) {
      throw new ValidationError("Embedding model is required.");
    }

    const chunks = await this.chunkReader.listByVersion(input.companyId, input.versionId);
    const existingJobs = await this.loadExistingJobs(input.companyId, chunks.map((chunk) => chunk.id));
    const jobsByChunk = new Map<string, EmbeddingJobRecord[]>();
    for (const job of existingJobs) {
      const current = jobsByChunk.get(job.knowledge_chunk_id) ?? [];
      current.push(job);
      jobsByChunk.set(job.knowledge_chunk_id, current);
    }

    let jobsCreated = 0;
    let jobsSkipped = 0;
    let jobsDuplicate = 0;
    let invalidChunksSkipped = 0;
    const pendingCreates: CreateEmbeddingJobInput[] = [];

    for (const chunk of chunks) {
      if (!isChunkEligible(chunk, input.companyId)) {
        invalidChunksSkipped += 1;
        continue;
      }

      const chunkJobs = jobsByChunk.get(chunk.id) ?? [];
      const activeJob = chunkJobs.find((job) =>
        QUEUE_JOB_STATUSES.includes(job.status as (typeof QUEUE_JOB_STATUSES)[number]),
      );
      if (activeJob) {
        if (activeJob.status === "queued" || activeJob.status === "running") {
          jobsDuplicate += 1;
        } else {
          jobsSkipped += 1;
        }
        continue;
      }

      const incrementalMatch = chunkJobs.find(
        (job) =>
          job.status === "completed" &&
          typeof job.metadata?.chunkChecksum === "string" &&
          job.metadata.chunkChecksum === chunk.checksum,
      );
      if (incrementalMatch) {
        jobsSkipped += 1;
        continue;
      }

      let embeddingVersion: number;
      try {
        embeddingVersion = await this.versionService.resolveNextVersion(chunk.id, providerKey, model, false);
      } catch {
        jobsSkipped += 1;
        continue;
      }

      pendingCreates.push({
        companyId: input.companyId,
        knowledgeChunkId: chunk.id,
        connectionId: connection.id,
        provider: providerKey,
        model,
        embeddingVersion,
        maxRetries: DEFAULT_MAX_RETRIES,
        metadata: {
          documentId: input.documentId,
          versionId: input.versionId,
          chunkChecksum: chunk.checksum,
          queueSource: "knowledge_publish",
        },
        createdBy: ctx.userId,
      });
    }

    const createdJobs: EmbeddingJobRecord[] = [];
    for (const batch of chunkArray(pendingCreates, QUEUE_INSERT_BATCH_SIZE)) {
      try {
        createdJobs.push(...(await this.jobRepository.createMany(batch)));
        jobsCreated += batch.length;
      } catch (error) {
        for (const item of batch) {
          try {
            createdJobs.push(await this.jobRepository.create(item));
            jobsCreated += 1;
          } catch {
            jobsDuplicate += 1;
          }
        }
        if (createdJobs.length === 0 && error instanceof Error) {
          throw error;
        }
      }
    }

    const queuedJobCount =
      existingJobs.filter((job) => job.status === "queued" || job.status === "running").length + jobsCreated;
    const completedAt = new Date().toISOString();
    const idempotent = jobsCreated === 0 && queuedJobCount > 0;
    const publishing = getPublishingMetadata(document.metadata);

    const updatedDocument = await this.documentRepository.update({
      documentId: input.documentId,
      status: queuedJobCount > 0 ? "indexing" : document.status,
      metadata: withPublishingMetadata(document.metadata, {
        embedding_status: queuedJobCount > 0 ? "queued" : publishing.embedding_status ?? "pending",
        queued_at: queuedJobCount > 0 ? completedAt : publishing.queued_at,
        queue: {
          started_at: startedAt,
          completed_at: completedAt,
          jobs_created: jobsCreated,
          jobs_skipped: jobsSkipped,
          jobs_duplicate: jobsDuplicate,
          invalid_chunks_skipped: invalidChunksSkipped,
          queued_job_count: queuedJobCount,
        },
      }),
    });

    return {
      document: updatedDocument,
      jobsCreated,
      jobsSkipped,
      jobsDuplicate,
      invalidChunksSkipped,
      queuedJobCount,
      idempotent,
    };
  }

  private async loadExistingJobs(companyId: string, chunkIds: string[]): Promise<EmbeddingJobRecord[]> {
    if (chunkIds.length === 0) return [];

    const results: EmbeddingJobRecord[] = [];
    for (const batch of chunkArray(chunkIds, 200)) {
      results.push(
        ...(await this.jobRepository.listByChunkIds({
          companyId,
          chunkIds: batch,
          statuses: [...QUEUE_JOB_STATUSES],
        })),
      );
    }
    return results;
  }

  private async resolveConnection(
    ctx: ServiceContext,
    companyId: string,
    connectionId?: string,
  ): Promise<EmbeddingProviderConnectionRecord | null> {
    if (connectionId) {
      const connection = await this.connectionRepository.findById(connectionId);
      if (!connection || connection.company_id !== companyId || !connection.is_enabled) return null;
      return connection;
    }

    const connections = await this.connectionRepository.list({ companyId, isEnabled: true });
    return connections.find((item) => item.is_default) ?? connections[0] ?? null;
  }

  private async assertActiveTenant(companyId: string): Promise<void> {
    const { data, error } = await this.client
      .from("companies")
      .select("status, subscription_status")
      .eq("id", companyId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new ValidationError("Tenant company was not found.");
    }

    const status = String(data.status ?? "");
    const subscriptionStatus = String(data.subscription_status ?? "");
    if (!ACTIVE_COMPANY_STATUSES.has(status) || INACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      throw new ValidationError("Tenant is not active for embedding queue creation.");
    }
  }
}

export function createEmbeddingQueueService(
  client: SupabaseClient,
  deps: {
    documentRepository: KnowledgeDocumentRepository;
    jobRepository: EmbeddingJobRepository;
    connectionRepository: EmbeddingProviderConnectionRepository;
    chunkReader: KnowledgeChunkReader;
    versionService: EmbeddingVersionService;
  },
): EmbeddingQueueService {
  return new EmbeddingQueueService(
    client,
    deps.documentRepository,
    deps.jobRepository,
    deps.connectionRepository,
    deps.chunkReader,
    deps.versionService,
  );
}
