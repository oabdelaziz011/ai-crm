import type { VectorStoreServices } from "@workspace/vector-store";
import { EMBEDDING_PERMISSIONS } from "../constants.js";
import { ValidationError } from "../errors.js";
import type { EmbeddingJobRecord, ServiceContext } from "../types.js";

export const DEFAULT_KNOWLEDGE_COLLECTION_NAME = "knowledge_default";

export type IndexCompletedJobsResult = {
  indexed: number;
  skipped: number;
  failed: number;
  vectorLatencyMs: number;
};

export class EmbeddingIndexingService {
  private readonly collectionCache = new Map<string, string>();

  constructor(private readonly vectorStore: VectorStoreServices) {}

  async indexCompletedJobs(
    ctx: ServiceContext,
    companyId: string,
    jobs: EmbeddingJobRecord[],
  ): Promise<IndexCompletedJobsResult> {
    const completedJobs = jobs.filter((job) => job.status === "completed" && job.result_embedding_id);
    if (completedJobs.length === 0) {
      return { indexed: 0, skipped: 0, failed: 0, vectorLatencyMs: 0 };
    }

    const collectionId = await this.resolveDefaultCollectionId(ctx, companyId);
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    const started = Date.now();

    for (const job of completedJobs) {
      try {
        await this.vectorStore.management.indexEmbedding(ctx, {
          companyId,
          collectionId,
          knowledgeEmbeddingId: job.result_embedding_id!,
        });
        indexed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Vector indexing failed.";
        if (message.includes("already indexed")) {
          skipped += 1;
          continue;
        }
        failed += 1;
      }
    }

    return {
      indexed,
      skipped,
      failed,
      vectorLatencyMs: Date.now() - started,
    };
  }

  private async resolveDefaultCollectionId(ctx: ServiceContext, companyId: string): Promise<string> {
    const cached = this.collectionCache.get(companyId);
    if (cached) return cached;

    const collections = await this.vectorStore.collections.listCollections(ctx, {
      companyId,
      isActive: true,
    });
    const preferred =
      collections.find((collection) => collection.name === DEFAULT_KNOWLEDGE_COLLECTION_NAME) ??
      collections[0];
    if (!preferred) {
      throw new ValidationError(`No active vector collection found for company ${companyId}.`);
    }

    this.collectionCache.set(companyId, preferred.id);
    return preferred.id;
  }
}
