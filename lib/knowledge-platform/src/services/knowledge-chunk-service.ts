import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import {
  KnowledgeDocumentNotFoundError,
  KnowledgeVersionNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ChunkingStrategy } from "../ingestion/chunking-strategy.js";
import type {
  KnowledgeChunkRepository,
  KnowledgeDocumentRepository,
  KnowledgeSectionRepository,
  KnowledgeVersionRepository,
} from "../repositories/knowledge-repositories.js";
import type { CreateKnowledgeChunkInput, ListKnowledgeChunksFilter, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(KNOWLEDGE_PERMISSIONS.view);
}

export class KnowledgeChunkService {
  constructor(
    private readonly chunkRepository: KnowledgeChunkRepository,
    private readonly documentRepository: KnowledgeDocumentRepository,
    private readonly versionRepository: KnowledgeVersionRepository,
    private readonly sectionRepository: KnowledgeSectionRepository,
    private readonly chunkingStrategy: ChunkingStrategy,
  ) {}

  async generateChunksForVersion(ctx: ServiceContext, documentId: string, versionId: string, text?: string) {
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

    await this.chunkRepository.softDeleteByVersion(versionId, ctx.userId);
    const drafts = this.chunkingStrategy.chunk(sourceText);
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
    assertPermission(ctx, KNOWLEDGE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    const chunks = await this.chunkRepository.list(filter);
    return [...chunks].sort((a, b) => a.chunk_order - b.chunk_order);
  }
}
