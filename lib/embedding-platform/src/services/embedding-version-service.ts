import { EMBEDDING_PERMISSIONS } from "../constants.js";
import {
  EmbeddingChecksumMismatchError,
  EmbeddingNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { KnowledgeEmbeddingRepository } from "../repositories/embedding-repositories.js";
import type { KnowledgeEmbeddingRecord, ListKnowledgeEmbeddingsFilter, ServiceContext } from "../types.js";
import { validateEmbeddingChecksum } from "../utils/embedding-utils.js";

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

export class EmbeddingVersionService {
  constructor(private readonly embeddingRepository: KnowledgeEmbeddingRepository) {}

  async listVersions(
    ctx: ServiceContext,
    filter: ListKnowledgeEmbeddingsFilter,
  ): Promise<KnowledgeEmbeddingRecord[]> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.embeddingRepository.list(filter);
  }

  async getActiveEmbedding(
    ctx: ServiceContext,
    companyId: string,
    knowledgeChunkId: string,
    provider: string,
    model: string,
  ): Promise<KnowledgeEmbeddingRecord | null> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);
    return this.embeddingRepository.findActive(knowledgeChunkId, provider, model);
  }

  async activateEmbedding(ctx: ServiceContext, embeddingId: string): Promise<KnowledgeEmbeddingRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.manage);

    const embedding = await this.embeddingRepository.findById(embeddingId);
    if (!embedding) throw new EmbeddingNotFoundError(embeddingId);
    assertCompanyAccess(ctx, embedding.company_id);

    if (
      !validateEmbeddingChecksum({
        chunkChecksum: String(embedding.metadata.chunkChecksum ?? ""),
        provider: embedding.provider,
        model: embedding.model,
        vector: embedding.vector,
        checksum: embedding.checksum,
      })
    ) {
      throw new EmbeddingChecksumMismatchError();
    }

    await this.embeddingRepository.deactivateActive(
      embedding.knowledge_chunk_id,
      embedding.provider,
      embedding.model,
    );

    return this.embeddingRepository.update({
      embeddingId,
      status: "active",
      isActive: true,
      activatedAt: new Date().toISOString(),
    });
  }

  async resolveNextVersion(
    knowledgeChunkId: string,
    provider: string,
    model: string,
    regenerate: boolean,
  ): Promise<number> {
    const latest = await this.embeddingRepository.getLatestVersion(knowledgeChunkId, provider, model);
    if (regenerate) return latest + 1;
    if (latest === 0) return 1;
    throw new ValidationError("Embedding already exists. Set regenerate=true to create a new version.");
  }
}
