import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeVersionNotFoundError,
  ValidationError,
} from "../errors.js";
import type { ChunkStrategyRegistry, ChunkingStrategyName } from "../ingestion/chunk-strategy-registry.js";
import type { ChunkingOptions } from "../ingestion/chunking-strategy.js";
import type {
  KnowledgeChunkRepository,
  KnowledgeDocumentRepository,
  KnowledgeSectionRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import type { CreateKnowledgeChunkInput, ListKnowledgeChunksFilter, ServiceContext } from "../types.js";
import {
  assertCompanyAccess,
  assertKnowledgeFeatureEnabled,
  assertPermission,
} from "../utils/knowledge-guards.js";

export type GenerateChunksOptions = {
  strategyName?: ChunkingStrategyName;
  chunkingOptions?: ChunkingOptions;
};

export class KnowledgeChunkService {
  constructor(
    private readonly chunkRepository: KnowledgeChunkRepository,
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
    private readonly sectionRepository: KnowledgeSectionRepository,
    private readonly chunkStrategyRegistry: ChunkStrategyRegistry,
  ) {}

  async generateChunksForVersion(
    ctx: ServiceContext,
    documentId: string,
    versionId: string,
    text?: string,
    options?: GenerateChunksOptions,
  ) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.import);
    const document = await this.documentRepository.findById(documentId);
    if (!document) throw new KnowledgeDocumentNotFoundError(documentId);
    assertCompanyAccess(ctx, document.company_id);

    const version = await this.versionRepository.findById(versionId);
    if (!version || version.document_id !== documentId) throw new KnowledgeVersionNotFoundError(versionId);

    let sourceText = text?.trim() ?? "";
    if (!sourceText) {
      const sections = await this.sectionRepository.list({
        companyId: document.company_id,
        documentId,
        versionId,
      });
      sourceText = sections.map((section) => `${section.title}\n${section.content}`.trim()).join("\n\n");
    }

    if (!sourceText) throw new ValidationError("No section content available to chunk.");

    const strategy = this.chunkStrategyRegistry.resolve(options?.strategyName ?? "paragraph");
    await this.chunkRepository.softDeleteByVersion(versionId, ctx.userId);
    const drafts = strategy.chunk(sourceText, options?.chunkingOptions);
    const inputs: CreateKnowledgeChunkInput[] = drafts.map((draft) => ({
      companyId: document.company_id,
      documentId,
      versionId,
      chunkOrder: draft.chunkOrder,
      content: draft.content,
      tokenCount: draft.tokenCount,
      checksum: draft.checksum,
      metadata: draft.metadata ?? {},
    }));

    return this.chunkRepository.createMany(inputs);
  }

  async listChunks(ctx: ServiceContext, filter: ListKnowledgeChunksFilter) {
    assertKnowledgeFeatureEnabled(ctx);
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    const chunks = await this.chunkRepository.list(filter);
    return [...chunks].sort((a, b) => a.chunk_order - b.chunk_order);
  }
}
